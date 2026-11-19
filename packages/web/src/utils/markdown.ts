import MarkdownIt from 'markdown-it';

export interface MarkdownHeading {
  id: string;
  label: string;
  level: number;
}

let renderer: InstanceType<typeof MarkdownIt> | null = null;

/**
 * 单例渲染器。
 * html: false 是关键防线——原始 HTML 会被转义，Markdown 文件无法注入脚本；
 * 链接统一加 target/rel，避免新窗口拿到 window.opener。
 */
export function renderMarkdown(source: string): string {
  if (!renderer) {
    const md = new MarkdownIt({ html: false, linkify: true, breaks: false });
    const defaultLinkOpen =
      md.renderer.rules.link_open ??
      ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

    md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
      tokens[idx].attrSet('target', '_blank');
      tokens[idx].attrSet('rel', 'noopener noreferrer');
      return defaultLinkOpen(tokens, idx, options, env, self);
    };
    renderer = md;
  }
  return renderer.render(source);
}
