import regular from "pdfmake/build/fonts/Roboto/Roboto-Regular.ttf?url";
import italic from "pdfmake/build/fonts/Roboto/Roboto-Italic.ttf?url";
import medium from "pdfmake/build/fonts/Roboto/Roboto-Medium.ttf?url";
import mediumItalic from "pdfmake/build/fonts/Roboto/Roboto-MediumItalic.ttf?url";

// The same files pdfmake embeds. Its "bold" is Roboto Medium, so bold on the sheet maps to Medium as well.
const faces: [string, FontFaceDescriptors][] = [
  [regular, { weight: "400", style: "normal" }],
  [italic, { weight: "400", style: "italic" }],
  [medium, { weight: "500 700", style: "normal" }],
  [mediumItalic, { weight: "500 700", style: "italic" }],
];

let loaded = false;
export function loadWriterFonts() {
  if (loaded || typeof document === "undefined") return;
  loaded = true;
  for (const [url, desc] of faces) {
    const face = new FontFace("Writer Roboto", `url(${url})`, desc);
    document.fonts.add(face);
    face.load().catch(() => {});
  }
}
