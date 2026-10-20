'use client';

export default function PrintButton() {
  return (
    <button className="btn gold" onClick={() => window.print()} data-testid="print">
      اطبع الشهادة
    </button>
  );
}
