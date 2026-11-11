import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
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
const ALLOWED_CHANNELS = (process.env.ALLOWED_CHANNEL_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

client.once("ready", () => {
  console.log(`🤖 機器人已上線：${client.user.tag}`);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "黑名單") return;

  // 1. 權限檢驗
  const isAllowedChannel =
    ALLOWED_CHANNELS.length === 0 ||
    ALLOWED_CHANNELS.includes(interaction.channelId);

  if (!isAllowedChannel) {
    return interaction.reply({
      content: "❌ 你沒有在此頻道使用此指令的權限。",
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
        `✅ 已成功新增：\n• **ID**：\`${id}\`\n• **事項**：${note}\n• **回報者**：${reporter}`,
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
          { name: "事項", value: record.note, inline: false },
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

client.login(process.env.DISCORD_TOKEN);
