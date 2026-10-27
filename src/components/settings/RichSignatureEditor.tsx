'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Account } from '@/types';
import {
  Bold,
  Italic,
  Underline,
  Link as LinkIcon,
  List,
  Save,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Eye,
  Image as ImageIcon,
  Upload,
  X,
  Columns,
} from 'lucide-react';

interface RichSignatureEditorProps {
  accounts: Account[];
  onSignatureUpdated: (account: Account) => void;
}

function extractSignatureParts(html: string) {
  if (typeof window === 'undefined' || !html.trim()) {
    return {
      hasText: false,
      textHtml: '',
      imgSrc: null,
      imgHeight: null,
      linkUrl: null,
    };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  let foundImgSrc: string | null = null;
  let foundImgHeight: string | null = null;
  let foundLinkUrl: string | null = null;

  const existingImg = doc.querySelector('img');
  if (existingImg) {
    foundImgSrc = existingImg.getAttribute('src');
    const styleHeight = existingImg.style.maxHeight || existingImg.getAttribute('height');
    if (styleHeight) {
      foundImgHeight = styleHeight.replace('px', '').trim();
    }
    const parentAnchor = existingImg.closest('a');
    if (parentAnchor) {
      foundLinkUrl = parentAnchor.getAttribute('href');
    }
  }

  let textHtml = '';
  const cells = doc.querySelectorAll('td');
  if (cells.length >= 2) {
    const textCell = Array.from(cells).find((td) => !td.querySelector('img'));
    if (textCell) {
      textHtml = textCell.innerHTML.trim();
    }
  }

  if (!textHtml) {
    const imgs = doc.querySelectorAll('img');
    imgs.forEach((img) => {
      const parentA = img.closest('a');
      if (parentA && parentA.childNodes.length === 1) {
        parentA.remove();
      } else {
        img.remove();
      }
    });

    // Clean up empty wrapper elements left behind by the image
    doc.body.querySelectorAll('p, div, span').forEach((el) => {
      if (!el.textContent?.trim() && el.children.length === 0) {
        el.remove();
      }
    });

    textHtml = doc.body.innerHTML.trim();
  }

  const plainText = textHtml.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();

  return {
    hasText: plainText.length > 0,
    textHtml: plainText.length > 0 ? textHtml : '',
    imgSrc: foundImgSrc,
    imgHeight: foundImgHeight,
    linkUrl: foundLinkUrl,
  };
}

export default function RichSignatureEditor({
  accounts,
  onSignatureUpdated,
}: RichSignatureEditorProps) {
  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    accounts[0]?.id || ''
  );
  const [signatureHtml, setSignatureHtml] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [imageLinkUrl, setImageLinkUrl] = useState('');
  const [imageHeight, setImageHeight] = useState('40');
  const [logoAlignment, setLogoAlignment] = useState<'left' | 'top' | 'right'>('left');
  const [separatorColor, setSeparatorColor] = useState<string>('#6366f1'); // Default Indigo accent
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editorRef = useRef<HTMLDivElement>(null);
  const loadedAccountIdRef = useRef<string | null>(null);

  const currentAccount = accounts.find((a) => a.id === selectedAccountId);

  useEffect(() => {
    if (!selectedAccountId && accounts.length > 0) {
      setSelectedAccountId(accounts[0].id);
      return;
    }
    if (currentAccount && loadedAccountIdRef.current !== currentAccount.id) {
      loadedAccountIdRef.current = currentAccount.id;
      const sig = currentAccount.signature || '';
      setSignatureHtml(sig);
      if (editorRef.current) {
        editorRef.current.innerHTML = sig;
      }
    }
  }, [selectedAccountId, currentAccount, accounts]);

  const exec = (cmd: string, val: string | undefined = undefined) => {
    document.execCommand(cmd, false, val);
    if (editorRef.current) {
      setSignatureHtml(editorRef.current.innerHTML);
    }
  };

  const handleInsertLink = () => {
    const url = prompt('Enter link URL (e.g. https://company.com):');
    if (url) exec('createLink', url);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) setImageUrl(result);
    };
    reader.readAsDataURL(file);
  };

  const handleInsertLogo = () => {
    if (!imageUrl.trim()) return;

    const currentHtml = editorRef.current?.innerHTML || signatureHtml || '';
    const { hasText, textHtml } = extractSignatureParts(currentHtml);

    const defaultPlaceholderText = [
      '<div style="font-weight: 600; font-size: 14px; color: #ffffff;">Your Name</div>',
      '<div style="color: #94a3b8; font-size: 12px;">Your Title</div>',
      '<div style="color: #94a3b8; font-size: 12px;">Phone: (555) 000-0000</div>',
    ].join('\n');

    const textContent = hasText ? textHtml : defaultPlaceholderText;

    const rawImg = `<img src="${imageUrl.trim()}" alt="Logo" style="max-height: ${imageHeight}px; width: auto; max-width: 200px; display: inline-block; vertical-align: middle; border: 0;" />`;
    const imgTag = imageLinkUrl.trim()
      ? `<a href="${imageLinkUrl.trim()}" target="_blank" style="text-decoration: none;">${rawImg}</a>`
      : rawImg;

    let finalMarkup = '';

    if (logoAlignment === 'left') {
      finalMarkup = `
<table cellpadding="0" cellspacing="0" border="0" style="font-family: Arial, Helvetica, sans-serif; font-size: 13px; line-height: 1.45; color: #cbd5e1; border-collapse: collapse; margin-top: 6px;">
  <tr>
    <td style="vertical-align: middle; padding-right: 14px; line-height: 0;">
      ${imgTag}
    </td>
    <td style="border-left: 2px solid ${separatorColor}; padding-left: 14px; vertical-align: middle;">
      ${textContent}
    </td>
  </tr>
</table>`.trim();
    } else if (logoAlignment === 'top') {
      finalMarkup = `
<div style="margin-bottom: 8px; line-height: 0;">${imgTag}</div>
<div>${textContent}</div>`.trim();
    } else if (logoAlignment === 'right') {
      finalMarkup = `
<table cellpadding="0" cellspacing="0" border="0" style="font-family: Arial, Helvetica, sans-serif; font-size: 13px; line-height: 1.45; color: #cbd5e1; border-collapse: collapse; margin-top: 6px;">
  <tr>
    <td style="border-right: 2px solid ${separatorColor}; padding-right: 14px; vertical-align: middle;">
      ${textContent}
    </td>
    <td style="vertical-align: middle; padding-left: 14px; line-height: 0;">
      ${imgTag}
    </td>
  </tr>
</table>`.trim();
    }

    if (editorRef.current) {
      editorRef.current.innerHTML = finalMarkup;
    }
    setSignatureHtml(finalMarkup);
    setIsImageModalOpen(false);
    setImageUrl('');
    setImageLinkUrl('');
  };

  const handleToggleLayout = () => {
    const currentHtml = editorRef.current?.innerHTML || signatureHtml || '';
    if (!currentHtml.trim()) {
      setStatusMsg({ type: 'error', text: 'No signature content to reformat. Add text or insert a logo first.' });
      setTimeout(() => setStatusMsg(null), 4000);
      return;
    }

    const { hasText, textHtml, imgSrc, imgHeight, linkUrl } = extractSignatureParts(currentHtml);

    if (!imgSrc) {
      setStatusMsg({
        type: 'error',
        text: 'No logo image found to reformat. Use the image tool to insert a logo first.',
      });
      setTimeout(() => setStatusMsg(null), 4000);
      return;
    }

    const defaultPlaceholderText = [
      '<div style="font-weight: 600; font-size: 14px; color: #ffffff;">Your Name</div>',
      '<div style="color: #94a3b8; font-size: 12px;">Your Title</div>',
      '<div style="color: #94a3b8; font-size: 12px;">Phone: (555) 000-0000</div>',
    ].join('\n');

    const textContent = hasText ? textHtml : defaultPlaceholderText;
    const heightToUse = imgHeight || imageHeight || '40';

    const rawImg = `<img src="${imgSrc}" alt="Logo" style="max-height: ${heightToUse}px; width: auto; max-width: 200px; display: inline-block; vertical-align: middle; border: 0;" />`;
    const imgTag = linkUrl
      ? `<a href="${linkUrl}" target="_blank" style="text-decoration: none;">${rawImg}</a>`
      : rawImg;

    const isTableLayout = /<table/i.test(currentHtml);

    let newMarkup = '';
    if (isTableLayout) {
      newMarkup = `
<div style="margin-bottom: 8px; line-height: 0;">${imgTag}</div>
<div>${textContent}</div>`.trim();
      setStatusMsg({ type: 'success', text: 'Converted to Top-Stacked layout!' });
    } else {
      newMarkup = `
<table cellpadding="0" cellspacing="0" border="0" style="font-family: Arial, Helvetica, sans-serif; font-size: 13px; line-height: 1.45; color: #cbd5e1; border-collapse: collapse; margin-top: 6px;">
  <tr>
    <td style="vertical-align: middle; padding-right: 14px; line-height: 0;">
      ${imgTag}
    </td>
    <td style="border-left: 2px solid ${separatorColor}; padding-left: 14px; vertical-align: middle;">
      ${textContent}
    </td>
  </tr>
</table>`.trim();
      setStatusMsg({ type: 'success', text: 'Converted to Left-Separated layout with vertical divider!' });
    }

    if (editorRef.current) {
      editorRef.current.innerHTML = newMarkup;
    }
    setSignatureHtml(newMarkup);
    setTimeout(() => setStatusMsg(null), 4000);
  };

  const handleSaveSignature = async () => {
    if (!currentAccount) return;
    setSaving(true);
    setStatusMsg(null);

    const htmlToSave = editorRef.current?.innerHTML || signatureHtml;

    try {
      const res = await fetch(`/api/accounts/${currentAccount.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signature: htmlToSave }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update signature');

      onSignatureUpdated(data);
      setStatusMsg({ type: 'success', text: 'Email signature saved successfully!' });
      setTimeout(() => setStatusMsg(null), 4000);
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err?.message || 'Error saving signature' });
    } finally {
      setSaving(false);
    }
  };

  if (accounts.length === 0) {
    return (
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 text-center text-slate-400 text-sm">
        Connect an email account first to configure custom HTML signatures.
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-100">Rich HTML Signatures</h3>
          <p className="text-xs text-slate-400">
            Signatures are auto-injected when sending replies from this mailbox.
          </p>
        </div>

        {/* Account Selector */}
        <select
          value={selectedAccountId}
          onChange={(e) => setSelectedAccountId(e.target.value)}
          className="px-3.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        >
          {accounts.map((acc) => (
            <option key={acc.id} value={acc.id}>
              {acc.name} ({acc.email})
            </option>
          ))}
        </select>
      </div>

      {statusMsg && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center gap-2 ${
            statusMsg.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
          }`}
        >
          {statusMsg.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* Editor & Preview Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Editor Column */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Signature Content
          </label>
          <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-950">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-1 p-2 border-b border-slate-800 bg-slate-900/60 text-slate-400">
              <button
                type="button"
                onClick={() => exec('bold')}
                className="p-1.5 rounded hover:bg-slate-800 hover:text-slate-200"
                title="Bold"
              >
                <Bold className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => exec('italic')}
                className="p-1.5 rounded hover:bg-slate-800 hover:text-slate-200"
                title="Italic"
              >
                <Italic className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => exec('underline')}
                className="p-1.5 rounded hover:bg-slate-800 hover:text-slate-200"
                title="Underline"
              >
                <Underline className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleInsertLink}
                className="p-1.5 rounded hover:bg-slate-800 hover:text-slate-200"
                title="Insert Link"
              >
                <LinkIcon className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => exec('insertUnorderedList')}
                className="p-1.5 rounded hover:bg-slate-800 hover:text-slate-200"
                title="Bullet List"
              >
                <List className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setIsImageModalOpen(true)}
                className="p-1.5 rounded hover:bg-slate-800 hover:text-slate-200"
                title="Insert Logo / Image"
              >
                <ImageIcon className="w-3.5 h-3.5" />
              </button>

              <div className="w-px h-4 bg-slate-800 mx-1 hidden sm:block" />

              <button
                type="button"
                onClick={handleToggleLayout}
                className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-slate-800 hover:text-indigo-400 text-xs font-medium transition-colors"
                title="Convert Layout (Left Separated vs Top Stacked)"
              >
                <Columns className="w-3.5 h-3.5" />
                <span className="hidden sm:inline text-[11px]">Convert Layout</span>
              </button>
            </div>

            {/* Canvas */}
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={() => {
                if (editorRef.current) setSignatureHtml(editorRef.current.innerHTML);
              }}
              className="p-3.5 min-h-[140px] text-xs text-slate-200 focus:outline-none"
              data-placeholder="Best regards,<br><b>Your Name</b><br>Executive Title"
            />
          </div>
        </div>

        {/* Live Preview Column */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
            <Eye className="w-3.5 h-3.5 text-indigo-400" />
            <span>Live Output Preview</span>
          </div>
          <div className="rounded-xl border border-slate-800/80 bg-slate-950 p-4 min-h-[175px] text-xs text-slate-300">
            {signatureHtml ? (
              <div
                dangerouslySetInnerHTML={{ __html: signatureHtml }}
                className="space-y-1 font-sans text-xs"
              />
            ) : (
              <p className="text-slate-600 italic">No signature defined for this account.</p>
            )}
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-2">
        <button
          onClick={handleSaveSignature}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-lg shadow-indigo-600/25 transition-all disabled:opacity-50"
        >
          {saving ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Saving...</span>
            </>
          ) : (
            <>
              <Save className="w-3.5 h-3.5" />
              <span>Save Signature</span>
            </>
          )}
        </button>
      </div>

      {/* Insert Logo / Image Modal */}
      {isImageModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-semibold text-slate-100">Insert Logo / Image</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsImageModalOpen(false);
                  setImageUrl('');
                  setImageLinkUrl('');
                }}
                className="p-1 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              {/* File Upload Option */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Upload Image File
                </label>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-slate-700 hover:border-indigo-500 bg-slate-950/50 hover:bg-indigo-500/5 text-xs text-slate-300 transition-colors"
                >
                  <Upload className="w-4 h-4 text-indigo-400" />
                  <span>Choose local file (PNG, JPG, SVG)...</span>
                </button>
              </div>

              <div className="flex items-center gap-2 my-1">
                <div className="flex-1 h-px bg-slate-800" />
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Or Image URL</span>
                <div className="flex-1 h-px bg-slate-800" />
              </div>

              {/* Direct URL Option */}
              <div>
                <input
                  type="url"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://company.com/logo.png"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Alignment Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Logo Alignment &amp; Layout
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    { id: 'left', label: '⬅️ Left', desc: 'Side-by-side with separator' },
                    { id: 'top', label: '⬆️ Top', desc: 'Stacked above text' },
                    { id: 'right', label: '➡️ Right', desc: 'Side-by-side with separator' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setLogoAlignment(opt.id as 'left' | 'top' | 'right')}
                      className={`px-3 py-2 rounded-xl text-left border transition-all ${
                        logoAlignment === opt.id
                          ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/50 shadow-sm'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                      }`}
                    >
                      <div className="font-semibold text-xs">{opt.label}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Separator Color Presets (Visible when Left or Right is selected) */}
              {logoAlignment !== 'top' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Separator Line Color
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { label: 'Indigo Accent', color: '#6366f1' },
                      { label: 'Subtle Slate', color: '#334155' },
                      { label: 'Executive Silver', color: '#94a3b8' },
                      { label: 'Emerald', color: '#10b981' },
                    ].map((preset) => (
                      <button
                        key={preset.color}
                        type="button"
                        onClick={() => setSeparatorColor(preset.color)}
                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                          separatorColor === preset.color
                            ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/50'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                        }`}
                      >
                        <span
                          className="w-3 h-3 rounded-full shrink-0 border border-white/20"
                          style={{ backgroundColor: preset.color }}
                        />
                        <span className="truncate">{preset.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Size Presets */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Size Preset
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Small (28px)', value: '28' },
                    { label: 'Standard (40px)', value: '40' },
                    { label: 'Large (54px)', value: '54' },
                  ].map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => setImageHeight(preset.value)}
                      className={`px-2 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                        imageHeight === preset.value
                          ? 'bg-indigo-600/20 text-indigo-400 border-indigo-500/50'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Optional Link URL */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Link Destination (Optional)
                </label>
                <input
                  type="url"
                  value={imageLinkUrl}
                  onChange={(e) => setImageLinkUrl(e.target.value)}
                  placeholder="https://yourwebsite.com"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Live Modal Preview */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Live Layout Preview
                </label>
                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-center min-h-[80px] overflow-x-auto">
                  {imageUrl ? (
                    logoAlignment === 'left' ? (
                      <div className="flex items-center gap-3.5">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={imageUrl}
                          alt="Preview"
                          style={{ maxHeight: `${imageHeight}px` }}
                          className="object-contain shrink-0"
                        />
                        <div
                          style={{ borderLeftColor: separatorColor }}
                          className="border-l-2 pl-3.5 py-0.5 text-left font-sans"
                        >
                          <div className="font-semibold text-white text-xs leading-tight">Alex Morgan</div>
                          <div className="text-slate-400 text-[11px] leading-tight">Operations Director</div>
                          <div className="text-slate-500 text-[10px] leading-tight mt-0.5">example@company.com</div>
                        </div>
                      </div>
                    ) : logoAlignment === 'right' ? (
                      <div className="flex items-center gap-3.5">
                        <div
                          style={{ borderRightColor: separatorColor }}
                          className="border-r-2 pr-3.5 py-0.5 text-right font-sans"
                        >
                          <div className="font-semibold text-white text-xs leading-tight">Alex Morgan</div>
                          <div className="text-slate-400 text-[11px] leading-tight">Operations Director</div>
                          <div className="text-slate-500 text-[10px] leading-tight mt-0.5">example@company.com</div>
                        </div>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={imageUrl}
                          alt="Preview"
                          style={{ maxHeight: `${imageHeight}px` }}
                          className="object-contain shrink-0"
                        />
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-center font-sans">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={imageUrl}
                          alt="Preview"
                          style={{ maxHeight: `${imageHeight}px` }}
                          className="object-contain shrink-0"
                        />
                        <div>
                          <div className="font-semibold text-white text-xs leading-tight">Alex Morgan</div>
                          <div className="text-slate-400 text-[11px] leading-tight">Operations Director</div>
                          <div className="text-slate-500 text-[10px] leading-tight mt-0.5">example@company.com</div>
                        </div>
                      </div>
                    )
                  ) : (
                    <div className="text-slate-500 text-xs italic">
                      Upload or enter an image URL above to see live preview
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setIsImageModalOpen(false);
                  setImageUrl('');
                  setImageLinkUrl('');
                }}
                className="px-4 py-1.5 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleInsertLogo}
                disabled={!imageUrl.trim()}
                className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-md shadow-indigo-600/20 transition-all disabled:opacity-50"
              >
                Insert Image
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
