import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";
import { createClient } from "@supabase/supabase-js";
import axios from "axios";
import FormData from "form-data";
import sharp from "sharp";
import dotenv from "dotenv";
dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages, // 接收伺服器文字訊息事件
    GatewayIntentBits.MessageContent, // 讀取訊息內容與附件資訊
  ],
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: false,
    },
    realtime: {
      params: {
        eventsPerSecond: 0,
      },
    },
  },
);

// 讀取環境變數設定的白名單（支援逗號分隔多個 ID）
const COMMAND_CHANNEL_ID = process.env.COMMAND_CHANNEL_ID?.trim() || "";
const SCAN_CHANNEL_ID = process.env.SCAN_CHANNEL_ID?.trim() || "";

client.once("ready", () => {
  console.log(`🤖 機器人已上線：${client.user.tag}`);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // 檢查主指令名稱
  if (interaction.commandName !== "校欸") return;

  // 限制僅在指定頻道使用
  if (COMMAND_CHANNEL_ID && interaction.channelId !== COMMAND_CHANNEL_ID) {
    return interaction.reply({
      content: `❌ 指令僅限在 <#${COMMAND_CHANNEL_ID}> 頻道使用。`,
      ephemeral: true,
    });
  }

  const sub = interaction.options.getSubcommand();
  await interaction.deferReply();

  try {
    // 新增
    if (sub === "add") {
      const id = interaction.options.getString("id").trim();
      const note = interaction.options.getString("note").trim();
      // 取得在該伺服器的暱稱 (nickname)
      const reporter = interaction.member.displayName;

      const { error } = await supabase
        .from("records")
        .insert([{ id, note, reporter }]);

      if (error) {
        if (error.code === "23505") {
          return interaction.editReply(
            `⚠️ ID \`${id}\` 已存在，請勿重複新增。`,
          );
        }
        throw error;
      }
      return interaction.editReply(
        `✅ 已成功新增：\n• **ID**：\`${id}\`\n• **事蹟**：${note}\n• **回報者**：${reporter}`,
      );
    }

    // 刪除
    if (sub === "delete") {
      const id = interaction.options.getString("id").trim();
      const { data: deleted, error } = await supabase
        .from("records")
        .delete()
        .eq("id", id)
        .select();

      if (error) throw error;
      if (!deleted || deleted.length === 0) {
        return interaction.editReply(`❌ 找不到 ID \`${id}\`。`);
      }
      return interaction.editReply(`🗑️ 已刪除 ID \`${id}\`。`);
    }

    // 單一查詢
    if (sub === "get") {
      const id = interaction.options.getString("id").trim();
      const { data: record, error } = await supabase
        .from("records")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;
      if (!record) {
        return interaction.editReply(`🔍 查無 ID \`${id}\` 的資料。`);
      }

      // 轉換時間格式為本地時間 (YYYY-MM-DD HH:mm)
      const createdAtFormatted = new Date(record.created_at).toLocaleString(
        "zh-TW",
        {
          timeZone: "Asia/Taipei",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        },
      );

      const embed = new EmbedBuilder()
        .setTitle(`📄 查詢結果：${record.id}`)
        .setColor(0x3498db)
        .addFields(
          { name: "事蹟", value: record.note, inline: false },
          { name: "回報者", value: record.reporter, inline: true },
          { name: "加入時間", value: createdAtFormatted, inline: true },
        );
      return interaction.editReply({ embeds: [embed] });
    }

    // --- 列出全部 ---
    if (sub === "list") {
      const { data: records, error } = await supabase
        .from("records")
        .select("id, note, reporter, created_at")
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (!records || records.length === 0) {
        return interaction.editReply("目前資料庫內沒有任何記錄。");
      }

      const lines = records.map((r, i) => {
        const time = new Date(r.created_at).toLocaleDateString("zh-TW", {
          timeZone: "Asia/Taipei",
        });
        return `${i + 1}. \`${r.id}\` | ${r.note} (由 ${r.reporter} 於 ${time} 加入)`;
      });

      const content =
        `📋 **目前記錄清單 (${records.length} 筆)**：\n\n` + lines.join("\n");

      if (content.length > 2000) {
        return interaction.editReply(
          content.slice(0, 1990) + "\n...(過長截斷)",
        );
      }
      return interaction.editReply(content);
    }
  } catch (err) {
    console.error("執行指令錯誤：", err);
    return interaction.editReply("❌ 資料庫操作發生異常，請稍後再試。");
  }
});

// 在 client 外層全域宣告防重 Set
const processingMessages = new Set();

client.on("messageCreate", async (message) => {
  console.log(
    `[Message] 收到訊息 | 頻道 ID: ${message.channelId} | 作者: ${message.author.tag} (${message.author.id})`,
  );

  // 1. 如果該則訊息已經在處理中，直接略過
  if (processingMessages.has(message.id)) return;
  // 2. 標記此訊息已進入處理，避免並行重複觸發
  processingMessages.add(message.id);

  if (message.author.bot) {
    console.log(`[Filter] 略過機器人自己的訊息`);
    return;
  }

  if (SCAN_CHANNEL_ID && message.channelId !== SCAN_CHANNEL_ID) {
    return;
  }

  console.log(`[Attachments] 訊息附件數量: ${message.attachments.size}`);

  const imageAttachment = message.attachments.find((att) =>
    att.contentType?.startsWith("image/"),
  );

  if (!imageAttachment) {
    console.log(
      `[Filter] 該訊息未包含圖片格式附件 (contentTypes: ${
        Array.from(message.attachments.values())
          .map((a) => a.contentType)
          .join(", ") || "無"
      })`,
    );
    return;
  }

  console.log(`[Image Detected] 抓取到圖片附件:
  • 檔名: ${imageAttachment.name}
  • 格式: ${imageAttachment.contentType}
  • 原始大小: ${(imageAttachment.size / 1024).toFixed(2)} KB
  • 網址: ${imageAttachment.url}`);

  const scanningMsg = await message.reply(
    "🔍 正在壓縮並掃描截圖中的 ID，請稍候...",
  );

  try {
    // 1. 先下載原圖至記憶體 Buffer
    const imageResponse = await axios.get(imageAttachment.url, {
      responseType: "arraybuffer",
    });
    const originalBuffer = Buffer.from(imageResponse.data);

    // 2. 使用 sharp 進行最佳化壓縮（限制最大寬度 1600px，轉成 80% JPEG，大小通常只有 200~400KB）
    const compressedBuffer = await sharp(originalBuffer)
      .resize({ width: 1600, withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();

    // 3. 轉為 Base64 Data URL 傳送給 OCR.Space（免費版支援 base64Image 欄位）
    const base64Image = `data:image/jpeg;base64,${compressedBuffer.toString("base64")}`;

    const formData = new FormData();
    formData.append("base64Image", base64Image);
    formData.append("language", "cht"); // 繁體中文（包含英數）
    formData.append("isOverlayRequired", "false");
    formData.append("scale", "true");

    const ocrResponse = await axios.post(
      "https://api.ocr.space/parse/image",
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          apikey: process.env.OCR_SPACE_API_KEY || "helloworld",
        },
        timeout: 20000,
      },
    );

    const parsedResults = ocrResponse.data?.ParsedResults;
    if (!parsedResults || parsedResults.length === 0) {
      await scanningMsg.edit("⚠️ 截圖模糊或未解析到文字，跳過比對。");
      setTimeout(() => scanningMsg.delete().catch(() => {}), 4000);
      return;
    }

    const rawText = parsedResults[0].ParsedText || "";
    const cleanOcrText = rawText.toLowerCase().replace(/\s+/g, "");

    // 4. 從 Supabase 取黑名單並比對
    const { data: records, error } = await supabase
      .from("records")
      .select("id, note, reporter, created_at");

    if (error) throw error;
    if (!records || records.length === 0) {
      await scanningMsg.delete().catch(() => {});
      return;
    }

    const detectedTargets = records.filter((record) => {
      const targetId = record.id.toLowerCase().replace(/\s+/g, "");
      if (targetId.length < 2) return false;
      return cleanOcrText.includes(targetId);
    });

    if (detectedTargets.length === 0) {
      await scanningMsg.edit(
        "✅ 掃描完畢：截圖中未發現任何黑名單校ㄟ，安全上車！",
      );
      setTimeout(() => scanningMsg.delete().catch(() => {}), 10000);
    } else {
      const alertEmbed = new EmbedBuilder()
        .setTitle(`🚨 發現 ${detectedTargets.length} 位名單內的可疑對象！`)
        .setColor(0xe74c3c);

      detectedTargets.forEach((target) => {
        const time = new Date(target.created_at).toLocaleDateString("zh-TW", {
          timeZone: "Asia/Taipei",
        });
        alertEmbed.addFields({
          name: `⚠️ ID: ${target.id}`,
          value: `**事蹟**：${target.note}\n**通報人**：${target.reporter} (${time})`,
          inline: false,
        });
      });

      await scanningMsg.edit({
        content: "⚡ **避雷警報觸發！**",
        embeds: [alertEmbed],
      });
    }
  } catch (err) {
    console.error("OCR 辨識錯誤：", err);
    await scanningMsg.edit("❌ 截圖辨識過程發生錯誤。");
    setTimeout(() => scanningMsg.delete().catch(() => {}), 5000);
  } finally {
    // 3. 處理完畢（或出錯）後移出 Set
    processingMessages.delete(message.id);
  }
});

client.login(process.env.DISCORD_TOKEN);
