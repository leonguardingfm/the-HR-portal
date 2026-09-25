import Image from "next/image";

/**
 * The Leon Guarding logo inside the portal (26 September 2026): black
 * lettering on a light theme, white on a dark one. Both are in the page and
 * the theme shows the right one (globals.css), so it is right from the first
 * paint, whatever theme — or device setting — a person uses.
 */
export function BrandLogo({ className = "h-9 w-auto" }: { className?: string }) {
  return (
    <>
      <Image src="/brand/leon-logo-dark.png" alt="Leon Guarding" width={746} height={317} priority className={`brand-on-light ${className}`} />
      <Image src="/brand/leon-logo-light.png" alt="Leon Guarding" width={746} height={317} priority className={`brand-on-dark ${className}`} />
    </>
  );
}

/** The shield alone, where there is room for nothing more. */
export function BrandShield({ className = "h-7 w-auto" }: { className?: string }) {
  return <Image src="/brand/leon-shield.png" alt="Leon Guarding" width={253} height={317} className={className} />;
}
