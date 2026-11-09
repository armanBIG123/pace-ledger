// Test stand-in for DocuSeal's <docuseal-form> web component.
(function () {
  if (customElements.get('docuseal-form')) return;
  class F extends HTMLElement {
    connectedCallback() {
      const src = this.getAttribute('data-src') || '';
      const sig = this.getAttribute('data-signature') || '';
      const prefilled = this.getAttribute('data-with-complete-button') === 'true';
      this.innerHTML = '<div data-testid="docuseal-stub" style="border:1px solid #DEE3E8;border-radius:8px;padding:16px;background:#fff;font-family:Georgia,serif">'
        + '<p style="margin:0 0 6px;font-weight:700;font-size:12px;letter-spacing:.04em;text-align:center">INDEPENDENT AGENT AGREEMENT</p>'
        + '<p style="margin:0 0 10px;font-size:12px;color:#5E6A77;text-align:center">DocuSeal signing form (test stand-in) · ' + src.replace(/^https?:\/\//, '') + '</p>'
        + (prefilled ? '<p data-testid="docuseal-complete-top" style="margin:0 0 8px;text-align:right"><span style="display:inline-block;padding:6px 14px;border-radius:8px;background:#C49A3C;color:#13212E;font-weight:600;font-family:system-ui">Complete</span></p>' : '')
        + '<div style="height:120px;background:repeating-linear-gradient(#fff,#fff 14px,#EEF1F4 15px)"></div>'
        + (sig.startsWith('data:image') ? '<p style="margin:8px 0 0;font-size:12px;color:#5E6A77">Signature on every line:</p><img data-testid="docuseal-sig" alt="signature" src="' + sig + '" style="max-height:48px;display:block;margin-top:4px">' : '')
        + '<button type="button" data-testid="docuseal-finish" style="margin-top:10px;min-height:44px;width:100%;border-radius:8px;border:2px dashed #C49A3C;background:rgba(196,154,60,.13);font-weight:600">Tap to sign · Finish</button></div>';
      this.dispatchEvent(new CustomEvent('load', { detail: {} }));
      this.querySelector('[data-testid=docuseal-finish]').addEventListener('click', () => {
        this.dispatchEvent(new CustomEvent('completed', { detail: { status: 'completed', email: this.getAttribute('data-email') || '' } }));
      });
    }
  }
  customElements.define('docuseal-form', F);
})();
