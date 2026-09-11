import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Los enlaces de informes y respuestas del asistente suelen ser externos: se abren
// en otra pestana, sin pasar la pagina de origen, para no perder el trabajo.
const COMPONENTS = {
  a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
};

/** Markdown seguro: react-markdown no interpreta HTML crudo. */
export default function Markdown({ children }) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {children || ""}
      </ReactMarkdown>
    </div>
  );
}
