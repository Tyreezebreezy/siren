from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer
from pypdf import PdfReader, PdfWriter


ROOT = Path(__file__).resolve().parent


def create_text_pdf() -> None:
    output = ROOT / "text-document.pdf"
    styles = getSampleStyleSheet()
    story = [
        Paragraph("SIREN Text PDF Fixture", styles["Title"]),
        Spacer(1, 0.3 * inch),
        Paragraph(
            "This PDF contains a real text layer. SIREN should extract this "
            "sentence and preserve its punctuation.",
            styles["BodyText"],
        ),
        Spacer(1, 0.18 * inch),
        Paragraph(
            "The second paragraph asks a useful question: can the reader move "
            "forward? Yes, it can.",
            styles["BodyText"],
        ),
    ]
    document = SimpleDocTemplate(
        str(output),
        pagesize=letter,
        rightMargin=0.8 * inch,
        leftMargin=0.8 * inch,
        topMargin=0.8 * inch,
        bottomMargin=0.8 * inch,
        title="SIREN Text PDF Fixture",
        author="SIREN",
        invariant=1,
    )
    document.build(story)


def create_scanned_pdf() -> None:
    image_path = ROOT / "scanned-page.png"
    image = Image.new("RGB", (1200, 1600), "white")
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default(size=38)
    draw.text((110, 170), "SIREN scanned PDF fixture", fill="black", font=font)
    draw.text(
        (110, 245),
        "This page is one raster image and has no text layer.",
        fill="black",
        font=font,
    )
    draw.rectangle((90, 130, 1110, 330), outline="#666666", width=4)
    image.save(image_path)

    output = ROOT / "scanned-no-text.pdf"
    document = SimpleDocTemplate(
        str(output),
        pagesize=letter,
        rightMargin=0,
        leftMargin=0,
        topMargin=0,
        bottomMargin=0,
        title="SIREN Scanned PDF Fixture",
        author="SIREN",
        invariant=1,
    )
    from reportlab.platypus import Image as PdfImage

    document.build([PdfImage(str(image_path), width=7.5 * inch, height=10 * inch)])
    image_path.unlink()


def create_mixed_pdf() -> None:
    writer = PdfWriter()
    for path in (ROOT / "text-document.pdf", ROOT / "scanned-no-text.pdf"):
        for page in PdfReader(path).pages:
            writer.add_page(page)
    with (ROOT / "mixed-text-scan.pdf").open("wb") as output:
        writer.write(output)


if __name__ == "__main__":
    create_text_pdf()
    create_scanned_pdf()
    create_mixed_pdf()
