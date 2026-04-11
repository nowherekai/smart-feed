import type { ComponentPropsWithoutRef } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import { cn } from "@/lib/utils";

export type DigestMarkdownContentProps = {
  markdown: string;
};

const markdownComponents: Components = {
  a: ({ node: _node, className, href, rel, target, ...props }) => (
    <a
      className={cn("font-medium text-primary underline-offset-4 transition-colors hover:underline", className)}
      href={href}
      rel={rel ?? "noopener noreferrer"}
      target={target ?? "_blank"}
      {...props}
    />
  ),
};

type MarkdownContainerProps = ComponentPropsWithoutRef<"div">;

export function DigestMarkdownContent({
  markdown,
  className,
  ...props
}: DigestMarkdownContentProps & MarkdownContainerProps) {
  return (
    <div className={cn("prose-custom pb-20", className)} {...props}>
      <ReactMarkdown components={markdownComponents} skipHtml>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
