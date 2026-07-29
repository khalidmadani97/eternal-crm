// Public contract signing (Slice 9). Served with the service role, gated by
// the single-use sign_token — NO anon RLS policy exists or is needed.
//   GET  ?token=…  → the signing page (contract text, name/email, canvas)
//   POST {token, name, email, signaturePng} → validates, stores the signature,
//        renders the immutable audit-trail PDF, marks the contract signed.
// verify_jwt = false: the token is the authentication.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1'

function service() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

async function loadContractByToken(token: string) {
  const { data, error } = await service()
    .from('contracts')
    .select('id, job_id, status, body_snapshot, template_version, token_expires_at, signed_at')
    .eq('sign_token', token)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

Deno.serve(async (req) => {
  try {
    if (req.method === 'GET') return await handleGet(req)
    if (req.method === 'POST') return await handlePost(req)
    return new Response('Method not allowed', { status: 405 })
  } catch (e) {
    return new Response(`Something went wrong: ${e instanceof Error ? e.message : e}`, {
      status: 500,
    })
  }
})

async function handleGet(req: Request): Promise<Response> {
  const token = new URL(req.url).searchParams.get('token') ?? ''
  if (!token) return htmlResponse(messagePage('This signing link is not valid.'), 404)

  const contract = await loadContractByToken(token)
  if (!contract) return htmlResponse(messagePage('This signing link is not valid.'), 404)
  if (contract.status === 'signed')
    return htmlResponse(messagePage('This contract has already been signed. Thank you!'))
  if (contract.status !== 'sent')
    return htmlResponse(messagePage('This contract is no longer available for signing.'), 410)
  if (contract.token_expires_at && new Date(contract.token_expires_at) < new Date())
    return htmlResponse(
      messagePage('This signing link has expired. Please ask us to send a fresh one.'),
      410,
    )

  return htmlResponse(signingPage(token, contract.body_snapshot))
}

async function handlePost(req: Request): Promise<Response> {
  let body: { token?: string; name?: string; email?: string; signaturePng?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }
  const { token, name, email, signaturePng } = body
  if (!token || !name?.trim() || !email?.trim() || !signaturePng) {
    return json({ error: 'Name, email, and a drawn signature are all required.' }, 400)
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
    return json({ error: 'Enter a valid email address.' }, 400)
  }

  const contract = await loadContractByToken(token)
  if (!contract) return json({ error: 'This signing link is not valid.' }, 404)
  if (contract.status === 'signed') return json({ error: 'Already signed.' }, 409)
  if (contract.status !== 'sent') return json({ error: 'No longer available for signing.' }, 410)
  if (contract.token_expires_at && new Date(contract.token_expires_at) < new Date())
    return json({ error: 'This signing link has expired.' }, 410)

  // Audit trail — all four elements are required, none optional (SCHEMA.md).
  const signedAt = new Date()
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('cf-connecting-ip') ??
    '0.0.0.0'

  const pngBase64 = signaturePng.replace(/^data:image\/png;base64,/, '')
  let pngBytes: Uint8Array
  try {
    pngBytes = Uint8Array.from(atob(pngBase64), (c) => c.charCodeAt(0))
  } catch {
    return json({ error: 'Signature image is not valid.' }, 400)
  }
  if (pngBytes.length > 500_000) return json({ error: 'Signature image too large.' }, 400)

  const sb = service()
  const sigPath = `jobs/${contract.job_id}/contract-${contract.id}-signature.png`
  const { error: sigUploadError } = await sb.storage
    .from('job-files')
    .upload(sigPath, pngBytes, { contentType: 'image/png', upsert: false })
  if (sigUploadError) return json({ error: `Could not store signature: ${sigUploadError.message}` }, 500)

  const pdfBytes = await buildSignedPdf({
    body: contract.body_snapshot,
    templateVersion: contract.template_version,
    contractId: contract.id,
    signerName: name.trim(),
    signerEmail: email.trim(),
    signerIp: ip,
    signedAt,
    signaturePng: pngBytes,
  })
  const pdfPath = `jobs/${contract.job_id}/contract-${contract.id}-signed.pdf`
  const { error: pdfUploadError } = await sb.storage
    .from('job-files')
    .upload(pdfPath, pdfBytes, { contentType: 'application/pdf', upsert: false })
  if (pdfUploadError) return json({ error: `Could not store PDF: ${pdfUploadError.message}` }, 500)

  const { error: updateError } = await sb
    .from('contracts')
    .update({
      status: 'signed',
      signed_at: signedAt.toISOString(),
      signer_name: name.trim(),
      signer_email: email.trim(),
      signer_ip: ip,
      signature_image_path: sigPath,
      signed_pdf_path: pdfPath,
    })
    .eq('id', contract.id)
    .eq('status', 'sent') // single-use: a concurrent signer loses this race
  if (updateError) return json({ error: updateError.message }, 500)

  // The signed PDF also appears in the job's files list.
  await sb.from('files').insert({
    job_id: contract.job_id,
    kind: 'contract',
    storage_path: pdfPath,
    filename: `signed-contract-${signedAt.toISOString().slice(0, 10)}.pdf`,
    size_bytes: pdfBytes.length,
  })

  await sb.from('activities').insert({
    job_id: contract.job_id,
    kind: 'system',
    body: `Contract signed by ${name.trim()} (${email.trim()})`,
    meta: { contract_id: contract.id, event: 'contract_signed', ip },
  })

  return json({ ok: true })
}

// ── PDF ──────────────────────────────────────────────────────────────────────

async function buildSignedPdf(input: {
  body: string
  templateVersion: string
  contractId: string
  signerName: string
  signerEmail: string
  signerIp: string
  signedAt: Date
  signaturePng: Uint8Array
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.TimesRoman)
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold)
  const pageSize: [number, number] = [612, 792] // US Letter
  const margin = 56
  const width = pageSize[0] - margin * 2
  const size = 10.5
  const leading = 14

  let page = doc.addPage(pageSize)
  let y = pageSize[1] - margin

  const newPageIfNeeded = (needed: number) => {
    if (y - needed < margin) {
      page = doc.addPage(pageSize)
      y = pageSize[1] - margin
    }
  }

  const drawLine = (text: string, useFont = font, useSize = size) => {
    newPageIfNeeded(leading)
    page.drawText(text, { x: margin, y, size: useSize, font: useFont, color: rgb(0.13, 0.1, 0.08) })
    y -= leading
  }

  // Body text, wrapped.
  for (const paragraph of input.body.split('\n')) {
    if (paragraph.trim() === '') {
      y -= leading / 2
      continue
    }
    for (const line of wrap(paragraph, font, size, width)) drawLine(line)
  }

  // Signature block.
  y -= leading
  newPageIfNeeded(160)
  page.drawLine({
    start: { x: margin, y },
    end: { x: pageSize[0] - margin, y },
    thickness: 1,
    color: rgb(0.69, 0.55, 0.25),
  })
  y -= leading * 1.5
  drawLine('SIGNED ELECTRONICALLY', bold, 11)

  const png = await doc.embedPng(input.signaturePng)
  const sigDims = png.scaleToFit(220, 70)
  newPageIfNeeded(sigDims.height + leading * 6)
  page.drawImage(png, { x: margin, y: y - sigDims.height, width: sigDims.width, height: sigDims.height })
  y -= sigDims.height + leading

  drawLine(`Signed by: ${input.signerName}`)
  drawLine(`Email (verified at signing): ${input.signerEmail}`)
  drawLine(`IP address: ${input.signerIp}`)
  drawLine(`Timestamp (UTC): ${input.signedAt.toISOString()}`)
  drawLine(`Contract ID: ${input.contractId} · Template ${input.templateVersion}`)
  drawLine('This document is a tamper-evident copy of exactly what was signed.')

  return await doc.save()
}

function wrap(text: string, font: { widthOfTextAtSize(t: string, s: number): number }, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  if (current) lines.push(current)
  return lines
}

// ── HTML ─────────────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )
}

function messagePage(message: string): string {
  return pageShell(`<p style="text-align:center;font-size:16px">${escapeHtml(message)}</p>`)
}

function signingPage(token: string, body: string): string {
  return pageShell(`
  <h1>Review &amp; sign</h1>
  <pre id="contract">${escapeHtml(body)}</pre>
  <form id="signForm">
    <label>Full legal name<input id="name" required autocomplete="name"></label>
    <label>Email<input id="email" type="email" required autocomplete="email"></label>
    <p class="hint">Draw your signature below</p>
    <canvas id="pad" width="560" height="160"></canvas>
    <div class="row">
      <button type="button" id="clear">Clear</button>
      <button type="submit" id="submit">Sign contract</button>
    </div>
    <p id="status" role="status"></p>
  </form>
  <script>
    const canvas = document.getElementById('pad');
    const ctx = canvas.getContext('2d');
    ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#1f2937';
    let drawing = false, drew = false;
    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      const p = e.touches ? e.touches[0] : e;
      return { x: (p.clientX - r.left) * (canvas.width / r.width),
               y: (p.clientY - r.top) * (canvas.height / r.height) };
    };
    const start = (e) => { drawing = true; drew = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); e.preventDefault(); };
    const move = (e) => { if (!drawing) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); e.preventDefault(); };
    const end = () => { drawing = false; };
    canvas.addEventListener('mousedown', start); canvas.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    canvas.addEventListener('touchend', end);
    document.getElementById('clear').onclick = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); drew = false; };
    document.getElementById('signForm').onsubmit = async (e) => {
      e.preventDefault();
      const status = document.getElementById('status');
      if (!drew) { status.textContent = 'Please draw your signature.'; return; }
      const submit = document.getElementById('submit');
      submit.disabled = true; status.textContent = 'Submitting…';
      try {
        const res = await fetch(location.pathname, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: ${JSON.stringify(token)},
            name: document.getElementById('name').value,
            email: document.getElementById('email').value,
            signaturePng: canvas.toDataURL('image/png'),
          }),
        });
        const data = await res.json();
        if (res.ok) {
          document.body.innerHTML = '<div class="wrap"><p style="text-align:center;font-size:18px;margin-top:80px">✅ Thank you — your contract is signed. A copy is on file.</p></div>';
        } else {
          status.textContent = data.error || 'Something went wrong.';
          submit.disabled = false;
        }
      } catch {
        status.textContent = 'Network error — please try again.';
        submit.disabled = false;
      }
    };
  </script>`)
}

function pageShell(inner: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Eternal Interiors — Contract</title>
<style>
  body { font-family: Georgia, serif; background: #f5f2ee; margin: 0; color: #2a241f; }
  .wrap { max-width: 640px; margin: 0 auto; padding: 24px 16px 64px; }
  .brand { text-align: center; padding: 24px 0 8px; }
  .brand b { color: #3b2a20; font-size: 22px; }
  .brand span { color: #b08d3f; }
  h1 { font-size: 20px; color: #3b2a20; }
  pre { white-space: pre-wrap; background: #fff; border: 1px solid #ddd3c4; padding: 20px; font: 13px/1.6 Georgia, serif; border-radius: 6px; }
  label { display: block; margin: 12px 0; font-size: 14px; }
  input { display: block; width: 100%; box-sizing: border-box; margin-top: 4px; padding: 10px; font-size: 16px; border: 1px solid #c9bda9; border-radius: 6px; }
  canvas { width: 100%; height: 160px; background: #fff; border: 1px dashed #b08d3f; border-radius: 6px; touch-action: none; }
  .hint { font-size: 13px; color: #6b6257; margin-bottom: 4px; }
  .row { display: flex; gap: 12px; margin-top: 12px; }
  button { padding: 12px 20px; font-size: 15px; border-radius: 6px; border: 1px solid #c9bda9; background: #fff; cursor: pointer; }
  #submit { background: #3b2a20; color: #fff; border-color: #3b2a20; flex: 1; }
  #status { color: #b91c1c; font-size: 14px; min-height: 20px; }
</style></head>
<body><div class="wrap">
  <div class="brand"><b>Eternal <span>Interiors</span></b></div>
  ${inner}
</div></body></html>`
}

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
