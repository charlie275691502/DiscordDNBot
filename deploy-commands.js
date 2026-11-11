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
    .setDescription("校欸管理")
    .setDefaultMemberPermissions(PermissionFlagsBits.UseApplicationCommands)
    .addSubcommand((sub) =>
      sub
        .setName("新增")
        .setDescription("新增校欸")
        .addStringOption((opt) =>
          opt.setName("id").setDescription("ID").setRequired(true),
        )
        .addStringOption((opt) =>
          opt.setName("note").setDescription("事蹟").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("刪除")
        .setDescription("刪除校欸")
        .addStringOption((opt) =>
          opt.setName("id").setDescription("要刪除的 ID").setRequired(true),
        ),
    )
    .addSubcommand((sub) => sub.setName("清單").setDescription("列出所有校欸"))
    .addSubcommand((sub) =>
      sub
        .setName("查找")
        .setDescription("查找特定校欸")
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
