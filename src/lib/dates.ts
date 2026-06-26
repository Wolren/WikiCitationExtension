const MONTHS_SHORT: Record<string, string> = {
  "01": "January", "02": "February", "03": "March", "04": "April",
  "05": "May", "06": "June", "07": "July", "08": "August",
  "09": "September", "10": "October", "11": "November", "12": "December",
};

const MONTHS_FULL: Record<string, string> = {
  january: "January", february: "February", march: "March", april: "April",
  may: "May", june: "June", july: "July", august: "August",
  september: "September", october: "October", november: "November", december: "December",
  jan: "January", feb: "February", mar: "March", apr: "April",
  jun: "June", jul: "July", aug: "August", sep: "September",
  oct: "October", nov: "November", dec: "December",
};

interface DateFormat {
  pattern: RegExp;
  format(match: RegExpExecArray): string | null;
}

const FORMATS: DateFormat[] = [
  {
    pattern: /^(\d{4})-(\d{2})-(\d{2})$/,
    format: ([, y, m, d]) => {
      const month = MONTHS_SHORT[m];
      return month ? `${parseInt(d, 10)} ${month} ${y}` : null;
    },
  },
  {
    pattern: /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
    format: ([, y, m, d]) => {
      const paddedM = String(parseInt(m, 10)).padStart(2, "0");
      const month = MONTHS_SHORT[paddedM];
      return month ? `${parseInt(d, 10)} ${month} ${y}` : null;
    },
  },
  {
    pattern: /^(\d{4})-(\d{1})$/,
    format: ([, y, m]) => {
      const paddedM = String(parseInt(m, 10)).padStart(2, "0");
      const month = MONTHS_SHORT[paddedM];
      return month ? `${month} ${y}` : null;
    },
  },
  {
    pattern: /^(\d{4})-(\d{2})-(\d{2})T/,
    format: ([, y, m, d]) => {
      const month = MONTHS_SHORT[m];
      return month ? `${parseInt(d, 10)} ${month} ${y}` : null;
    },
  },
  {
    pattern: /^(\d{4})-(\d{2})$/,
    format: ([, y, m]) => {
      const month = MONTHS_SHORT[m];
      return month ? `${month} ${y}` : null;
    },
  },
  {
    pattern: /^(\w+)\s+(\d{1,2}),\s+(\d{4})$/,
    format: ([, m, d, y]) => {
      const month = MONTHS_FULL[m.toLowerCase()];
      return month ? `${parseInt(d, 10)} ${month} ${y}` : null;
    },
  },
  {
    pattern: /^(\d{1,2})\s+(\w+)\s+(\d{4})$/,
    format: ([, d, m, y]) => {
      const month = MONTHS_FULL[m.toLowerCase()];
      return month ? `${parseInt(d, 10)} ${month} ${y}` : null;
    },
  },
  {
    pattern: /^(\w+)\s+(\d{4})$/,
    format: ([, m, y]) => {
      const month = MONTHS_FULL[m.toLowerCase()];
      return month ? `${month} ${y}` : null;
    },
  },
];

export function normalizeDate(dateStr: string): string {
  const trimmed = dateStr.trim();
  if (!trimmed) return dateStr;
  if (/^\d{4}$/.test(trimmed)) return trimmed;

  for (const fmt of FORMATS) {
    const match = fmt.pattern.exec(trimmed);
    if (match) {
      const result = fmt.format(match);
      if (result !== null) return result;
    }
  }

  return dateStr;
}
