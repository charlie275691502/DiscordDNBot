import {
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
} from "discord.js";
import dotenv from "dotenv";
dotenv.config();

const commands = [
  new SlashCommandBuilder()
    .setName("黑名單")
    .setDescription("ID 與事項管理")
    .setDefaultMemberPermissions(PermissionFlagsBits.UseApplicationCommands)
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("新增項目")
        .addStringOption((opt) =>
          opt.setName("id").setDescription("ID / 名字").setRequired(true),
        )
        .addStringOption((opt) =>
          opt.setName("note").setDescription("事項").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("delete")
        .setDescription("刪除指定 ID")
        .addStringOption((opt) =>
          opt.setName("id").setDescription("要刪除的 ID").setRequired(true),
        ),
    )
    .addSubcommand((sub) => sub.setName("list").setDescription("列出所有記錄"))
    .addSubcommand((sub) =>
      sub
        .setName("get")
        .setDescription("精確查找特定 ID")
        .addStringOption((opt) =>
          opt.setName("id").setDescription("欲查詢的 ID").setRequired(true),
        ),
    ),
].map((cmd) => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log("正在向 Discord 註冊全域斜線指令...");
    await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), {
      body: commands,
    });
    console.log("✅ 指令註冊成功！");
  } catch (error) {
    console.error("註冊指令失敗：", error);
  }
})();
