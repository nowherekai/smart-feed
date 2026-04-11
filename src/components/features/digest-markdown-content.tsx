import type { ComponentPropsWithoutRef } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import { cn } from "@/lib/utils";

export type DigestMarkdownContentProps = {
  markdown: string;
};

const markdownComponents: Components = {
  h1: ({ node: _node, className, ...props }) => (
    <h1 className={cn("scroll-m-20 text-3xl font-bold tracking-tight text-foreground", className)} {...props} />
  ),
  h2: ({ node: _node, className, ...props }) => (
    <h2
      className={cn("scroll-m-20 text-2xl font-semibold tracking-tight text-foreground first:mt-0", className)}
      {...props}
    />
  ),
  h3: ({ node: _node, className, ...props }) => (
    <h3
      className={cn("scroll-m-20 text-[1.75rem] font-semibold tracking-tight text-foreground", className)}
      {...props}
    />
  ),
  p: ({ node: _node, className, ...props }) => (
    <p className={cn("text-[1.0625rem] leading-8 text-foreground", className)} {...props} />
  ),
  ul: ({ node: _node, className, ...props }) => <ul className={cn("ml-6 list-disc space-y-2", className)} {...props} />,
  ol: ({ node: _node, className, ...props }) => (
    <ol className={cn("ml-6 list-decimal space-y-2", className)} {...props} />
  ),
  li: ({ node: _node, className, ...props }) => (
    <li className={cn("pl-1 text-[1.0625rem] leading-8 text-foreground", className)} {...props} />
  ),
  blockquote: ({ node: _node, className, ...props }) => (
    <blockquote
      className={cn("rounded-r-xl border-l-4 border-primary/60 bg-muted/25 pr-4 pl-5", className)}
      {...props}
    />
  ),
  a: ({ node: _node, className, href, rel, target, ...props }) => (
    <a
      className={cn("font-medium text-primary underline-offset-4 transition-colors hover:underline", className)}
      href={href}
      rel={rel ?? "noopener noreferrer"}
      target={target ?? "_blank"}
      {...props}
    />
  ),
  hr: ({ node: _node, className, ...props }) => <hr className={cn("border-border/60", className)} {...props} />,
  code: ({ node: _node, className, ...props }) => (
    <code className={cn("font-mono text-[0.95em]", className)} {...props} />
  ),
  pre: ({ node: _node, className, ...props }) => <pre className={cn("overflow-x-auto", className)} {...props} />,
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
