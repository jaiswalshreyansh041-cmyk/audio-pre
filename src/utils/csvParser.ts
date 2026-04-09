/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import Papa from 'papaparse';
import { AnnotationRow, DisfluencyLabels } from '../types';

/** Parse HH:MM:SS.mmm, MM:SS.mmm, or bare seconds to seconds */
export function parseTimeToSeconds(t: string): number {
  if (!t) return 0;
  const s = t.trim();
  const parts = s.split(':');
  if (parts.length === 3) {
    return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
  } else if (parts.length === 2) {
    return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
  }
  return parseFloat(s) || 0;
}

/**
 * Parse the Disfluency column.
 * The column may hold: "None", "Filler", "False Start", "Self-repair",
 * "Repetition", "Long Pause" — or a comma/slash-separated combination.
 * It also supports Yes/No sub-columns if the data is in that form.
 */
function parseDisfluency(val: string): DisfluencyLabels {
  const empty: DisfluencyLabels = {
    filler: false, falseStart: false, selfRepair: false,
    repetition: false, longPause: false, none: true,
  };
  if (!val) return empty;
  const v = val.toLowerCase().trim();
  if (v === 'none' || v === 'no' || v === '') return empty;

  const parts = v.split(/[,;/|]+/).map(p => p.trim());
  const has = (kw: string) => parts.some(p => p.includes(kw));

  const result: DisfluencyLabels = {
    filler: has('filler'),
    falseStart: has('false start') || has('false_start') || has('falsestart'),
    selfRepair: has('self-repair') || has('self_repair') || has('selfrepair') || has('self repair'),
    repetition: has('repetition'),
    longPause: has('long pause') || has('long_pause') || has('longpause'),
    none: has('none'),
  };
  // If nothing detected but val isn't empty, mark as filler as a safe fallback
  const anyTrue = Object.values(result).some(Boolean);
  if (!anyTrue) result.none = true;
  return result;
}

/** Case-insensitive key lookup against a PapaParse row object */
function get(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const found = Object.keys(row).find(
      rk => rk.trim().toLowerCase() === k.toLowerCase()
    );
    if (found !== undefined && row[found] !== undefined) return (row[found] || '').trim();
  }
  return '';
}

export function parseAnnotationCSV(csvText: string): AnnotationRow[] {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  });

  if (parsed.errors.length > 0) {
    const fatal = parsed.errors.filter(e => e.type === 'Delimiter' || e.type === 'Quotes');
    if (fatal.length > 0) {
      throw new Error(`CSV parse error: ${fatal[0].message}`);
    }
  }

  return parsed.data.map((row, rowIndex) => {
    const emphasisRaw = get(row,
      'Emphasis', 'emphasis', 'Emphasis / Stress', 'emphasis/stress'
    );
    const emphasis = emphasisRaw
      ? emphasisRaw.split(',').map((w: string) => w.trim()).filter(Boolean)
      : [];

    // Turn number: parse from column, fallback to row index + 1
    const turnNoRaw = get(row,
      'Turn No.', 'Turn No', 'turn no.', 'turn no', 'turnno',
      'turn_no', 'turn_id', 'turn id', 'Turn ID', 'id'
    );
    const turnNo = parseInt(turnNoRaw) || (rowIndex + 1);

    // Disfluency: handle both single-column and separate Yes/No sub-columns (SunLiya.AI export format)
    const disfluencyRaw = get(row, 'Disfluency', 'disfluency');
    let disfluency: DisfluencyLabels;
    if (disfluencyRaw) {
      disfluency = parseDisfluency(disfluencyRaw);
    } else {
      // Try SunLiya.AI sub-columns: "Disfluency: None", "Disfluency: Filler", etc.
      const yn = (k: string) => get(row, k).toLowerCase() === 'yes';
      const hasSubCols =
        get(row, 'Disfluency: None', 'Disfluency: Filler', 'Disfluency: Repetition') !== '';
      if (hasSubCols) {
        disfluency = {
          none:       yn('Disfluency: None'),
          filler:     yn('Disfluency: Filler'),
          falseStart: yn('Disfluency: False Start'),
          selfRepair: yn('Disfluency: Self-repair'),
          repetition: yn('Disfluency: Repetition'),
          longPause:  yn('Disfluency: Long Pause'),
        };
      } else {
        disfluency = parseDisfluency('');
      }
    }

    return {
      taskId:            get(row, 'Task ID', 'task id', 'taskid', 'Task_ID'),
      turnNo,
      speaker:           get(row, 'Speaker', 'speaker', 'Speaker ID', 'speaker_id'),
      startTime:         parseTimeToSeconds(get(row, 'Start Time', 'start time', 'starttime', 'Start_Time', 'start', 'timestamp_start')),
      endTime:           parseTimeToSeconds(get(row, 'End Time', 'end time', 'endtime', 'End_Time', 'end', 'timestamp_end')),
      originalUtterance: get(row, 'Original Utterance', 'original utterance', 'utterance', 'Utterance', 'Original_Utterance', 'text', 'Text'),
      emotion:           get(row, 'Emotion', 'emotion'),
      intent:            get(row, 'Intent', 'intent'),
      speakingRate:      get(row, 'Speaking Rate', 'speaking rate', 'speakingrate', 'Speaking_Rate', 'speaking_rate'),
      disfluency,
      turnTakingEvent:   get(row, 'Turn-taking Event', 'turn-taking event', 'turntakingevent', 'turn taking event', 'Turn_taking_Event', 'turn_taking', 'Turn Taking'),
      emphasis,
      annotatorNotes:    get(row, 'Annotator Notes', 'annotator notes', 'annotatornotes', 'Annotator_Notes'),
    } as AnnotationRow;
  });
}

export function exportResultsCSV(rows: Array<Record<string, string | number>>): string {
  return Papa.unparse(rows);
}

/**
 * Parse a SunLiya.AI JSON file (ai_analysis.transcript_by_turn) into AnnotationRows.
 * Supports both the full master JSON and bare transcript arrays.
 */
export function parseAnnotationJSON(jsonText: string): AnnotationRow[] {
  let json: any;
  try {
    json = JSON.parse(jsonText);
  } catch {
    throw new Error('File is not valid JSON.');
  }

  const turns: any[] =
    json?.ai_analysis?.transcript_by_turn ??
    json?.transcript_by_turn ??
    json?.turns ??
    (Array.isArray(json) ? json : []);

  if (turns.length === 0) throw new Error('No transcript turns found in JSON.');

  return turns.map((t: any, idx: number) => {
    const ann = t.annotations ?? {};

    const rawStart = t.start_time ?? t.timestamp_start ?? t.start ?? '';
    const rawEnd   = t.end_time   ?? t.timestamp_end   ?? t.end   ?? '';
    const startTime = typeof rawStart === 'number' ? rawStart : parseTimeToSeconds(String(rawStart));
    const endTime   = typeof rawEnd   === 'number' ? rawEnd   : parseTimeToSeconds(String(rawEnd));

    const disfArr: string[] = Array.isArray(ann.disfluency ?? t.disfluency)
      ? (ann.disfluency ?? t.disfluency)
      : typeof (ann.disfluency ?? t.disfluency) === 'string'
        ? [(ann.disfluency ?? t.disfluency)]
        : [];

    const hasDisfluency = (k: string) => disfArr.some(v => v.toLowerCase().includes(k));

    const disfluency: DisfluencyLabels = {
      filler:     hasDisfluency('filler'),
      falseStart: hasDisfluency('false_start') || hasDisfluency('false start'),
      selfRepair: hasDisfluency('self_repair')  || hasDisfluency('self repair'),
      repetition: hasDisfluency('repetition'),
      longPause:  hasDisfluency('long_pause')   || hasDisfluency('long pause'),
      none:       hasDisfluency('none') || disfArr.length === 0,
    };

    const emphasisRaw: string[] = Array.isArray(ann.emphasis ?? t.emphasis)
      ? (ann.emphasis ?? t.emphasis)
      : typeof (ann.emphasis ?? t.emphasis) === 'string'
        ? (ann.emphasis ?? t.emphasis).split(',').map((s: string) => s.trim()).filter(Boolean)
        : [];

    const str = (v: any): string => (typeof v === 'string' ? v.trim() : '');
    const capitalise = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    return {
      taskId:            str(t.task_id ?? json?.ai_analysis?.task_id ?? ''),
      turnNo:            t.turn_id ?? idx + 1,
      speaker:           str(t.speaker ?? t.speaker_id ?? ''),
      startTime,
      endTime,
      originalUtterance: str(t.text ?? t.utterance ?? ''),
      emotion:           str(ann.emotion   ? capitalise(ann.emotion)        : t.emotion   ? capitalise(t.emotion)   : ''),
      intent:            str(ann.intent    ? capitalise(ann.intent)         : t.intent    ? capitalise(t.intent)    : ''),
      speakingRate:      str(ann.speaking_rate ? capitalise(ann.speaking_rate) : t.speaking_rate ? capitalise(t.speaking_rate) : ''),
      disfluency,
      turnTakingEvent:   str(ann.turn_taking ? ann.turn_taking.replace(/_/g, ' ') : t.turn_taking ?? ''),
      emphasis:          emphasisRaw,
      annotatorNotes:    '',
    } as AnnotationRow;
  });
}

/** Auto-detect file type and parse into AnnotationRows */
export async function parseAnnotationFile(file: File): Promise<AnnotationRow[]> {
  const text = await file.text();
  if (file.name.toLowerCase().endsWith('.json')) {
    return parseAnnotationJSON(text);
  }
  return parseAnnotationCSV(text);
}
