"use client";

import { type ChangeEvent, type ReactNode, useState } from "react";
import { shrinkImage } from "@/lib/shrinkImage";

// Wraps a normal Server Action <form> and shrinks a selected image file the
// moment it's chosen — so by submit time the input already holds a small JPEG
// and the form submits natively (redirects, the clicked button's `intent`, and
// all other fields keep working, with no submit interception). While a photo is
// being processed the form is briefly disabled so it can't be submitted with
// the original oversized file. Use this for forms that carry a photo alongside
// other fields, or whose action redirects; for a standalone photo upload,
// ImageUploadForm is simpler. See shrinkImage for the why.
export function CompressingForm({
  action,
  className,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  className?: string;
  children: ReactNode;
}) {
  const [processing, setProcessing] = useState(false);

  async function onChange(e: ChangeEvent<HTMLFormElement>) {
    const target: EventTarget = e.target;
    if (!(target instanceof HTMLInputElement) || target.type !== "file") return;
    const file = target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    setProcessing(true);
    try {
      const shrunk = await shrinkImage(file);
      const dt = new DataTransfer();
      dt.items.add(shrunk);
      // Setting .files programmatically does not re-fire change, so no loop.
      target.files = dt.files;
    } finally {
      setProcessing(false);
    }
  }

  return (
    <form action={action} onChange={onChange} className={className}>
      {/* display:contents keeps the form's own layout; disabling the fieldset
          blocks submit (and every control) only while a photo is shrinking. */}
      <fieldset disabled={processing} className="contents">
        {children}
      </fieldset>
    </form>
  );
}
