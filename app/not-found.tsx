import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="grid min-h-[70vh] place-items-center px-4 text-center">
      <div>
        <p className="font-head text-7xl font-extrabold text-white/15">404</p>
        <h1 className="mt-2 font-head text-2xl font-bold text-white">This page doesn&apos;t exist</h1>
        <p className="mt-2 text-white/60">It may have been moved or switched off.</p>
        <Link href="/" className="btn-primary mt-6">
          Back to home
        </Link>
      </div>
    </main>
  );
}
