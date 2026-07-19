/* ==========================================================================
   TaxBot CA Console - Authenticated API Helpers
   Shared session, CSRF header, and protected file-opening helpers.
   ========================================================================== */

function getCASession() {
  const sessionStr = localStorage.getItem('taxbot_ca_session');
  if (!sessionStr) {
    showAuthScreen();
    return null;
  }
  return JSON.parse(sessionStr);
}

function getAuthHeaders(extraHeaders = {}) {
  const caSession = getCASession();
  if (!caSession || !caSession.csrfToken) {
    throw new Error('Session expired. Please login again.');
  }
  return {
    ...extraHeaders,
    'X-CSRF-Token': caSession.csrfToken
  };
}

async function openAuthenticatedPdf(url) {
  const pdfWindow = window.open('', '_blank');
  try {
    const response = await fetch(url, {
      headers: getAuthHeaders(),
      credentials: 'same-origin'
    });
    if (!response.ok) {
      throw new Error('Failed to generate PDF report');
    }
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    if (pdfWindow) {
      pdfWindow.location.href = blobUrl;
    } else {
      window.open(blobUrl, '_blank');
    }
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60 * 1000);
  } catch (err) {
    if (pdfWindow) {
      pdfWindow.close();
    }
    showToast(err.message);
  }
}
