import './globals.css';

export const metadata = {
  title: 'منصة خُطى',
  description: 'منصة التعلّم المؤسسي لموظفي بلدية مدينة العين',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
