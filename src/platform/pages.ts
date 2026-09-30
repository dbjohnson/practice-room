export function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!,
  );
}

export function page(title: string, body: string) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>
<style>body{margin:0;background:#f5f3ed;color:#173a33;font:16px system-ui;display:grid;min-height:100dvh;place-items:center}main{box-sizing:border-box;width:min(92%,560px);padding:40px;background:white;border:1px solid #dfdfd6;border-radius:20px}h1{font-size:30px;line-height:1.15}p{line-height:1.6;color:#52635d}a{color:#173a33}a.button{display:inline-block;background:#173a33;color:white;padding:12px 20px;border-radius:8px;text-decoration:none}ul{padding:0;list-style:none}li{padding:14px 0;border-top:1px solid #ddd}small{display:block;color:#52635d;margin-top:5px}</style>
<main>${body}</main></html>`;
}
