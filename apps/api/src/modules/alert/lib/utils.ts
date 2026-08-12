export function generateHtmlTemplate(title: string, message: string, metadata?: Record<string, any>): string {
    const runId = metadata?.runId ? `<p><strong>Run ID:</strong> #${metadata.runId}</p>` : '';
    const repo = metadata?.repo ? `<p><strong>Repository:</strong> ${metadata.repo}</p>` : '';
    const actionUrl = metadata?.runUrl || '#';

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f5f7; padding: 20px; color: #333; }
            .card { max-width: 550px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e1e4e8; padding: 24px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
            .header { color: #cf222e; font-size: 20px; font-weight: 600; margin-bottom: 16px; border-bottom: 1px solid #eaecef; padding-bottom: 12px; }
            .content { line-height: 1.6; margin-bottom: 20px; font-size: 14px; }
            .meta-box { background: #f6f8fa; border-radius: 6px; padding: 12px; margin: 16px 0; font-size: 13px; }
            .btn { display: inline-block; background: #0969da; color: #ffffff !important; text-decoration: none; padding: 10px 18px; border-radius: 6px; font-weight: 500; font-size: 14px; }
            .footer { margin-top: 24px; font-size: 12px; color: #6e7781; text-align: center; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="header">🚨 ${title}</div>
            <div class="content">
              <p>${message}</p>
              ${metadata ? `<div class="meta-box">${repo}${runId}</div>` : ''}
              <a href="${actionUrl}" class="btn" target="_blank">View Workflow Run</a>
            </div>
            <div class="footer">
              Sent by your GitHub Actions Monitoring Platform
            </div>
          </div>
        </body>
      </html>
    `;
}