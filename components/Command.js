import Input from "./Input";
import Output from "./Output";

export default function Command({ command, output, onSubmit, onHistory }) {
  return (
    <div>
      <Input 
        command={command} 
        onSubmit={(command) => onSubmit(command)} 
        onHistory={onHistory}
      />
      {output && <Output output={output} />}
    </div>
  );
}