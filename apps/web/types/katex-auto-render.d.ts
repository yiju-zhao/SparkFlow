declare module "katex/dist/contrib/auto-render.mjs" {
  interface RenderOptions {
    delimiters?: { left: string; right: string; display: boolean }[];
    ignoredTags?: string[];
    ignoredClasses?: string[];
    errorCallback?: (msg: string, err: Error) => void;
    throwOnError?: boolean;
    strict?: boolean | "ignore" | "warn" | "error";
  }
  const renderMathInElement: (elem: HTMLElement, options?: RenderOptions) => void;
  export default renderMathInElement;
}
