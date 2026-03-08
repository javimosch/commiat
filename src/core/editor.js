const { spawn } = require("child_process");

const {
  ensureGlobalConfigFileExists,
  GLOBAL_CONFIG_PATH,
} = require("./globalStore");

function openConfigInEditor() {
  ensureGlobalConfigFileExists();
  const editor = process.env.EDITOR || "nano";
  console.log(`Opening global config ${GLOBAL_CONFIG_PATH} in ${editor}...`);
  try {
    const child = spawn(editor, [GLOBAL_CONFIG_PATH], {
      stdio: "inherit",
      detached: true,
    });
    child.on("error", (err) => {
      console.error(`\n❌ Failed to start editor '${editor}': ${err.message}`);
      console.error(
        `Please ensure '${editor}' is installed and in your PATH, or set the EDITOR environment variable.`,
      );
      process.exit(1);
    });
    child.on("exit", (code, signal) => {
      if (code === 0) {
        console.log(`\nEditor closed. Global config file saved (hopefully 😉).`);
      } else {
        console.warn(`\nEditor exited with code ${code} (signal: ${signal}).`);
      }
    });
  } catch (error) {
    console.error(`\n❌ Error spawning editor: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  openConfigInEditor,
};
