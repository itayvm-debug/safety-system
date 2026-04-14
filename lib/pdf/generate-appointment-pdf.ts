import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import fs from 'fs';
import path from 'path';
import { createServiceClient } from '@/lib/supabase/server';

// ─────────────────────────────────────────────────────────────────
// קואורדינטות שדות הטופס (נקודות PDF, מתחתית-שמאל של עמוד A4 = 595×842)
// אם הטקסט לא מיושר נכון לאחר הגדרה ראשונה — שנה את הערכים כאן.
// ─────────────────────────────────────────────────────────────────
const FONT_SIZE = 11;

// rightAlign=true: הטקסט מיושר לפי ה-x הימני של שדה המילוי
// rightAlign=false: הטקסט מתחיל ב-x (LTR — מספרים, תאריכים)
const FIELDS = {
  // (א) פרטי הממנה
  appointer_name:    { x: 450, y: 637, rightAlign: true  },
  appointer_address: { x: 380, y: 617, rightAlign: true  },
  appointer_zip:     { x: 218, y: 617, rightAlign: false },
  appointer_phone:   { x: 80,  y: 617, rightAlign: false },
  appointer_role:    { x: 450, y: 597, rightAlign: true  },

  // (ב) תיאור המכונה
  machine_name:      { x: 390, y: 547, rightAlign: true  },
  manufacturer:      { x: 155, y: 547, rightAlign: true  },
  machine_identifier:{ x: 370, y: 524, rightAlign: false },
  safe_working_load: { x: 155, y: 524, rightAlign: true  },
  power_type:        { x: 290, y: 501, rightAlign: true  },

  // (ג) המפעיל
  operator_last_name:  { x: 448, y: 443, rightAlign: true  },
  operator_first_name: { x: 308, y: 443, rightAlign: true  },
  operator_father_name:{ x: 155, y: 443, rightAlign: true  },
  operator_id:         { x: 448, y: 420, rightAlign: false },
  operator_birth_year: { x: 308, y: 420, rightAlign: false },
  operator_profession: { x: 155, y: 420, rightAlign: true  },
  operator_address:    { x: 448, y: 397, rightAlign: true  },

  // (ד) הצהרת הממנה
  appointer_date:      { x: 480, y: 218, rightAlign: false },
  appointer_decl_name: { x: 315, y: 218, rightAlign: true  },

  // (ה) הצהרת המפעיל
  operator_date:       { x: 480, y: 87,  rightAlign: false },
  operator_decl_name:  { x: 315, y: 87,  rightAlign: true  },
};

// מיקום תמונות החתימה
const SIG_APPOINTER = { x: 85,  y: 193, width: 130, height: 40 };
const SIG_OPERATOR  = { x: 85,  y: 62,  width: 130, height: 40 };

// ─────────────────────────────────────────────────────────────────

export interface AppointmentPdfData {
  appointmentId: string;
  worker_id: string;
  machine_name: string;
  manufacturer?: string;
  machine_identifier?: string;
  safe_working_load?: string;
  power_type?: string;
  appointer_name: string;
  appointer_role?: string;
  appointer_phone?: string;
  appointer_address?: string;
  appointer_zip?: string;
  appointment_date?: string;
  // שדות עובד
  worker_full_name: string;
  worker_id_number: string;
  worker_father_name?: string;
  worker_birth_year?: string | number;
  worker_profession?: string;
  worker_address?: string;
  // נתיבי חתימות ב-Storage
  operatorSigPath?: string | null;
  appointerSigPath?: string | null;
}

/** מחלק שם מלא לשם פרטי + שם משפחה */
function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: '' };
  const last = parts[parts.length - 1];
  const first = parts.slice(0, -1).join(' ');
  return { first, last };
}

/** הפיכת טקסט עברי לצורך ציור RTL ב-pdf-lib */
function rtl(text: string): string {
  if (!text) return '';
  return text.split('').reverse().join('');
}

/** פורמט תאריך YYYY-MM-DD → DD/MM/YYYY */
function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

export async function generateAppointmentPdf(
  data: AppointmentPdfData,
  supabase: ReturnType<typeof createServiceClient>
): Promise<string | null> {
  try {
    // טעינת תבנית ה-PDF
    const templatePath = path.join(process.cwd(), 'public/forms/form-18g.pdf');
    if (!fs.existsSync(templatePath)) {
      console.error('[pdf] Template not found:', templatePath);
      return null;
    }
    const templateBytes = fs.readFileSync(templatePath);

    // טעינת פונט עברי
    const fontPath = path.join(process.cwd(), 'public/fonts/heebo-hebrew.woff2');
    if (!fs.existsSync(fontPath)) {
      console.error('[pdf] Hebrew font not found:', fontPath);
      return null;
    }
    const fontBytes = fs.readFileSync(fontPath);

    // יצירת מסמך PDF
    const pdfDoc = await PDFDocument.load(templateBytes);
    pdfDoc.registerFontkit(fontkit as Parameters<typeof pdfDoc.registerFontkit>[0]);
    const font = await pdfDoc.embedFont(fontBytes);
    const page = pdfDoc.getPages()[0];

    const draw = (field: keyof typeof FIELDS, text: string) => {
      if (!text) return;
      const { x, y, rightAlign } = FIELDS[field];
      const color = rgb(0, 0, 0);
      if (rightAlign) {
        const displayText = rtl(text);
        const w = font.widthOfTextAtSize(displayText, FONT_SIZE);
        page.drawText(displayText, { x: x - w, y, font, size: FONT_SIZE, color });
      } else {
        page.drawText(text, { x, y, font, size: FONT_SIZE, color });
      }
    };

    // (א) ממנה
    draw('appointer_name',    data.appointer_name);
    draw('appointer_address', data.appointer_address ?? '');
    draw('appointer_zip',     data.appointer_zip ?? '');
    draw('appointer_phone',   data.appointer_phone ?? '');
    draw('appointer_role',    data.appointer_role ?? '');

    // (ב) מכונה
    draw('machine_name',       data.machine_name);
    draw('manufacturer',       data.manufacturer ?? '');
    draw('machine_identifier', data.machine_identifier ?? '');
    draw('safe_working_load',  data.safe_working_load ?? '');
    if (data.power_type) {
      const POWER_LABELS: Record<string, string> = {
        mechanical: 'כוח מכני',
        electric: 'חשמלי',
        hydraulic: 'הידראולי',
        pneumatic: 'פנאומטי',
      };
      draw('power_type', POWER_LABELS[data.power_type] ?? data.power_type);
    }

    // (ג) מפעיל
    const { first, last } = splitName(data.worker_full_name);
    draw('operator_last_name',   last);
    draw('operator_first_name',  first);
    draw('operator_father_name', data.worker_father_name ?? '');
    draw('operator_id',          data.worker_id_number);
    draw('operator_birth_year',  String(data.worker_birth_year ?? ''));
    draw('operator_profession',  data.worker_profession ?? '');
    draw('operator_address',     data.worker_address ?? '');

    // תאריכים + שמות בהצהרות
    const dateStr = formatDate(data.appointment_date ?? new Date().toISOString().split('T')[0]);
    draw('appointer_date',      dateStr);
    draw('appointer_decl_name', data.appointer_name);
    draw('operator_date',       dateStr);
    draw('operator_decl_name',  data.worker_full_name);

    // חתימות
    await embedSignature(pdfDoc, page, data.appointerSigPath, SIG_APPOINTER, supabase);
    await embedSignature(pdfDoc, page, data.operatorSigPath, SIG_OPERATOR, supabase);

    // שמירת PDF ל-Storage
    const pdfBytes = await pdfDoc.save();
    const storagePath = `appointment-pdfs/${data.worker_id}-${data.appointmentId}.pdf`;
    const { error } = await supabase.storage
      .from('worker-files')
      .upload(storagePath, pdfBytes, { contentType: 'application/pdf', upsert: true });

    if (error) {
      console.error('[pdf] Upload failed:', error.message);
      return null;
    }

    return storagePath;
  } catch (err) {
    console.error('[pdf] Generation error:', err);
    return null;
  }
}

async function embedSignature(
  pdfDoc: PDFDocument,
  page: ReturnType<PDFDocument['getPages']>[number],
  storagePath: string | null | undefined,
  pos: { x: number; y: number; width: number; height: number },
  supabase: ReturnType<typeof createServiceClient>
) {
  if (!storagePath) return;
  try {
    const { data } = await supabase.storage.from('worker-files').download(storagePath);
    if (!data) return;
    const arrayBuffer = await data.arrayBuffer();
    const imgBytes = new Uint8Array(arrayBuffer);
    const img = await pdfDoc.embedPng(imgBytes).catch(() => pdfDoc.embedJpg(imgBytes));
    page.drawImage(img, { x: pos.x, y: pos.y, width: pos.width, height: pos.height });
  } catch (err) {
    console.error('[pdf] Signature embed failed:', err);
  }
}
