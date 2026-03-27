import { useRef, useState } from "react";
import { CONTENTS } from "../utils/commandHelper";
import Command from "./Command";
import styles from "./Terminal.module.css";

export default function Terminal() {
  const [commands, setCommands] = useState([]);
  const [loading, setLoading] = useState(false);
  const [commandHistory, setCommandHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const terminalRef = useRef(null);

  const escapeHTML = (str) =>
    str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const addCommand = async (command) => {
    const normalizedCommand = command.toLowerCase().trim();
    let output;
    setLoading(true);
    setCommands([...commands, { command, output: "Loading..." }]);
    
    // Add to command history
    if (command.trim() !== "") {
      setCommandHistory(prev => [...prev, command]);
      setHistoryIndex(-1);
    }
    
    if (`${normalizedCommand}` in CONTENTS) {
      output = await CONTENTS[`${normalizedCommand}`]();
    } else if (normalizedCommand === "clear") {
      setLoading(false);
      return setCommands([]);
    } else {
      output = CONTENTS.error(escapeHTML(command));
    }

    setLoading(false);
    setCommands([...commands.slice(0, commands.length), { command, output }]);
    if (terminalRef) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  };

  const getHistoryCommand = (direction) => {
    if (commandHistory.length === 0) return "";
    
    let newIndex = historyIndex;
    if (direction === "up") {
      newIndex = historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1);
    } else if (direction === "down") {
      newIndex = historyIndex === -1 ? -1 : Math.min(commandHistory.length - 1, historyIndex + 1);
    }
    
    setHistoryIndex(newIndex);
    return newIndex === -1 ? "" : commandHistory[newIndex];
  };

  return (
    <div className={styles.terminal} ref={terminalRef}>
      {/* <Command command="help" output="Some very long text will go in here" /> */}
      {commands.map(({ command, output }, index) => (
        <Command command={command} output={output} key={index} />
      ))}
      {!loading && (
        <Command 
          onSubmit={(command) => addCommand(command)} 
          onHistory={(direction) => getHistoryCommand(direction)}
        />
      )}
    </div>
  );
}