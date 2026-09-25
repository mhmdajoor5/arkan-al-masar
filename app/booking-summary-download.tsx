'use client';

import {useEffect, useState} from 'react';
import {Download, ExternalLink, LoaderCircle, RotateCcw} from 'lucide-react';
import {useLocale} from '@/lib/arkan-client';

export default function BookingSummaryDownload({booking, stations}: {booking: any; stations: any[]}) {
  const {t} = useLocale();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{booking: any; stations: any[]; url: string} | null>(null);
  const [failed, setFailed] = useState(false);
  const url = result?.booking === booking && result?.stations === stations ? result.url : '';

  useEffect(() => {
    let active = true;
    let objectURL = '';
    const controller = new AbortController();
    setResult(null);
    setFailed(false);
    void import('@/lib/ticket-pdf')
      .then(module => module.ticketPDF(booking, stations, [], controller.signal))
      .then(blob => {
        if (!active) return;
        objectURL = URL.createObjectURL(blob);
        setResult({booking, stations, url: objectURL});
      })
      .catch(() => { if (active) setFailed(true); });
    return () => {
      active = false;
      controller.abort();
      if (objectURL) URL.revokeObjectURL(objectURL);
    };
  }, [booking, stations, attempt]);

  return <div className="summary-download" aria-busy={!url && !failed}>
    {url ? <>
      <a className="primary" href={url} download={`${booking.code}.pdf`} target="_blank" rel="noopener noreferrer">
        <Download size={18}/>{t('تحميل التذكرة بالعربية PDF', 'Download Arabic ticket PDF')}
      </a>
      <a className="text-button" href={url} target="_blank" rel="noopener noreferrer">
        <ExternalLink size={17}/>{t('فتح التذكرة', 'Open ticket')}
      </a>
    </> : failed ? <>
      <p className="pdf-download-error" role="alert">{t('تعذّر تجهيز التذكرة. حاول مرة أخرى.', 'Unable to prepare the ticket. Please try again.')}</p>
      <button type="button" className="primary" onClick={() => {setFailed(false); setAttempt(n => n + 1);}}>
        <RotateCcw size={18}/>{t('إعادة المحاولة', 'Try again')}
      </button>
    </> : <button type="button" className="primary" disabled>
      <LoaderCircle className="animate-spin" size={18}/><span role="status">{t('جارٍ تجهيز التذكرة…', 'Preparing ticket…')}</span>
    </button>}
  </div>;
}
