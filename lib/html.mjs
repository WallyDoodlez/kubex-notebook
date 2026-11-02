// The notebook as one self-contained HTML file: the same cells the pane draws.
// Each SVG sits in a sandboxed frame with no scripts, as the Desktop pane draws an interactive Svg.

const escapeHtml = (s) => {
    return String(s).replace(/[&<>"']/g, (ch) => {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
};

// Enough Markdown for notebook cells: headings, lists, code, bold, italic, inline code, links.
export function markdownToHtml(md) {
    const lines = String(md).replace(/\r\n/g, '\n').split('\n');
    const out = [];
    let list = null;
    let para = [];
    const inline = (s) => {
        return escapeHtml(s)
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
            .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    };
    const flush = () => {
        if (para.length) {
            out.push(`<p>${inline(para.join(' '))}</p>`);
            para = [];
        }
        if (list) {
            out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`);
            list = null;
        }
    };
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('```')) {
            flush();
            const code = [];
            for (i++; i < lines.length && !lines[i].startsWith('```'); i++) {
                code.push(lines[i]);
            }
            out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
            continue;
        }
        const heading = /^(#{1,4})\s+(.*)$/.exec(line);
        const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
        const numbered = /^\s*\d+\.\s+(.*)$/.exec(line);
        if (heading) {
            flush();
            const level = heading[1].length + 1;
            out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
        } else if (bullet || numbered) {
            if (para.length) {
                flush();
            }
            const tag = bullet ? 'ul' : 'ol';
            if (list && list.tag !== tag) {
                flush();
            }
            list = list ?? { tag, items: [] };
            list.items.push((bullet ?? numbered)[1]);
        } else if (!line.trim()) {
            flush();
        } else {
            if (list) {
                flush();
            }
            para.push(line.trim());
        }
    }
    flush();
    return out.join('\n');
}

// The frame takes the drawing's own proportions, from its viewBox or width and height.
export function svgAspect(svg) {
    const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(svg);
    if (vb) {
        return `${vb[1]} / ${vb[2]}`;
    }
    const w = /\bwidth\s*=\s*["']([\d.]+)/i.exec(svg);
    const h = /\bheight\s*=\s*["']([\d.]+)/i.exec(svg);
    return w && h ? `${w[1]} / ${h[1]}` : '16 / 9';
}

function cellHtml(cell) {
    const parts = [`<h2><span class="num">#${cell.id}</span> ${escapeHtml(cell.title)}</h2>`];
    if (cell.markdown) {
        parts.push(`<div class="md">${markdownToHtml(cell.markdown)}</div>`);
    }
    if (cell.svg) {
        // A light backing, so a drawing in fixed dark colors still reads in a dark theme.
        const doc = `<!doctype html><style>html,body{margin:0;height:100%;background:#fff;color:#1f2328}svg{display:block;width:100%;height:100%}</style>${cell.svg}`;
        parts.push(
            `<iframe class="svg" sandbox="" title="${escapeHtml(cell.alt)}" style="aspect-ratio:${svgAspect(cell.svg)}" srcdoc="${escapeHtml(doc)}"></iframe>`,
        );
    }
    if (cell.choices.length) {
        const chips = cell.choices.map((c) => {
            return `<span class="chip${c === cell.chosen ? ' on' : ''}">${escapeHtml(c)}</span>`;
        });
        parts.push(`<div class="choices">${chips.join('')}</div>`);
    }
    return `<section class="cell" id="cell-${cell.id}">${parts.join('\n')}</section>`;
}

export function notebookHtml(cells, { title = 'Notebook', updatedAt = Date.now(), large = false } = {}) {
    const body = cells.length
        ? [...cells].reverse().map(cellHtml).join('\n')
        : '<p class="empty">No cells yet.</p>';
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-src 'self' about: data:">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light dark; --fg: #1f2328; --bg: #fff; --muted: #59636e; --line: #d1d9e0; --chip: #f6f8fa; --on: #0969da; }
  @media (prefers-color-scheme: dark) { :root { --fg: #e6edf3; --bg: #0d1117; --muted: #9198a1; --line: #3d444d; --chip: #151b23; --on: #4493f8; } }
  body { font: 15px/1.5 system-ui, sans-serif; color: var(--fg); background: var(--bg); margin: 0 auto; max-width: 860px; padding: 24px; }
  header { color: var(--muted); font-size: 13px; margin-bottom: 16px; }
  .cell { border: 1px solid var(--line); border-radius: 10px; padding: 16px 20px; margin-bottom: 16px; }
  h2 { font-size: 17px; margin: 0 0 8px; } .num { color: var(--muted); font-weight: 400; }
  .md h2, .md h3, .md h4, .md h5 { font-size: 15px; margin: 12px 0 4px; }
  pre { background: var(--chip); padding: 10px; border-radius: 6px; overflow-x: auto; } code { font-size: 13px; }
  body.large { max-width: none; }
  body.large iframe.svg { height: calc(100vh - 170px); }
  iframe.svg { width: 100%; border: 0; display: block; margin-top: 8px; border-radius: 6px; background: #fff; }
  .choices { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
  .chip { border: 1px solid var(--line); background: var(--chip); border-radius: 999px; padding: 2px 12px; font-size: 13px; }
  .chip.on { border-color: var(--on); color: var(--on); font-weight: 600; }
  .empty { color: var(--muted); }
</style>
</head>
<body${large ? ' class="large"' : ''}>
<header>${escapeHtml(title)} · ${cells.length} cell${cells.length === 1 ? '' : 's'} · updated ${escapeHtml(new Date(updatedAt).toISOString())}</header>
${body}
</body>
</html>
`;
}
