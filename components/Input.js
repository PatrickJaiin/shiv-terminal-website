import { useEffect, useState, useRef } from "react";
import styles from "./Input.module.css";

export default function Input({ command, onSubmit, onHistory }) {
  const [_command, setCommand] = useState(command ? command : "");

  const handleSubmit = (e) => {
    e.preventDefault();
    setCommand("");
    return onSubmit(_command);
  };

  const handleKeyDown = (e) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      if (onHistory) {
        const historyCommand = onHistory(e.key === "ArrowUp" ? "up" : "down");
        setCommand(historyCommand);
      }
    }
  };

  return (
    <form onSubmit={(e) => handleSubmit(e)}>
      <label htmlFor="command">
        <span style={{ color: "#ff9e64" }}>λ</span> ::{" "}
        <span style={{ color: "var(--primary)" }}>~</span>{" "}
        <span style={{ color: "var(--secondary)" }}>&gt;&gt;</span>
      </label>

      <input
        type="text"
        className={styles.input}
        value={_command}
        onChange={(e) => setCommand(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={command ? true : false}
        ref={(input) => input && !command && input.focus()}
        autoFocus={command === ""}
      />
    </form>
  );
}