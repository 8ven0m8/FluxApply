## Setup
from os import getenv
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI 
from playwright.async_api import async_playwright
from typing import TypedDict, Optional, List
from pydantic import BaseModel, Field
from langgraph.store.base import BaseStore
from langchain_core.runnables import RunnableConfig
from langgraph.graph import StateGraph, START, END
from langgraph.store.postgres import PostgresStore
from langchain_core.output_parsers import PydanticOutputParser
from pypdf import PdfReader
from docx import Document
from docx.oxml.ns import qn
from pathlib import Path
from schemas import Details, Experience, Project, ResumeFact

load_dotenv()
llm = ChatOpenAI(
    base_url=getenv("FREELLMAPI_URL"),
    api_key=getenv("FREELLMAPI_KEY"),
    model="auto"
)


############### Extract text from pdf or doc #################
# text extraction
def extract_text_from_pdf(path: str) -> str:
    reader = PdfReader(path)
    text_parts = []
    for page in reader.pages:
        text_parts.append(page.extract_text() or "")
    return "\n".join(text_parts)
def extract_text_from_docx(path: str) -> str:
    doc = Document(path)
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]

    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                if cell.text.strip():
                    paragraphs.append(cell.text)

    return "\n".join(paragraphs)
def extract_resume_text(path: str) -> str:
    ext = Path(path).suffix.lower()

    if ext == ".pdf":
        return extract_text_from_pdf(path)
    elif ext == ".docx":
        return extract_text_from_docx(path)
    else:
        raise ValueError(f"Unsupported file type: {ext}. Only .pdf and .docx supported.")
# link extraction
def extract_links_from_pdf(path: str) -> list[str]:
    reader = PdfReader(path)
    links = []
    for page in reader.pages:
        if "/Annots" in page:
            for annot in page["/Annots"]:
                obj = annot.get_object()
                if "/A" in obj and "/URI" in obj["/A"]:
                    links.append(obj["/A"]["/URI"])
    return links
def extract_links_from_docx(path: str) -> list[str]:
    doc = Document(path)
    links = []

    rels = doc.part.rels

    for paragraph in doc.paragraphs:
        for hyperlink in paragraph._p.findall(qn('w:hyperlink')):
            rel_id = hyperlink.get(qn('r:id'))
            if rel_id and rel_id in rels:
                url = rels[rel_id].target_ref
                if url not in links:
                    links.append(url)

    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                for paragraph in cell.paragraphs:
                    for hyperlink in paragraph._p.findall(qn('w:hyperlink')):
                        rel_id = hyperlink.get(qn('r:id'))
                        if rel_id and rel_id in rels:
                            url = rels[rel_id].target_ref
                            if url not in links:
                                links.append(url)

    return links
def extract_links(path: str) -> list[str]:
    ext = Path(path).suffix.lower()
    if ext == ".pdf":
        return extract_links_from_pdf(path)
    elif ext == ".docx":
        return extract_links_from_docx(path)
    else:
        raise ValueError(f"Unsupported file type: {ext}")

############################# States ################################
class ResumeState(TypedDict):
    resume_text: Optional[str]
    resume_facts: Optional[ResumeFact]

resume_extraction_parser = PydanticOutputParser(
    pydantic_object=ResumeFact
)

############################ System prompt ###########################
SYSTEM_PROMPT_FOR_RESUME_EXTRACTION = """
You are an expert resume information extraction assistant.

Your task is to extract structured information from the provided resume and populate the output according to the given schema.

Instructions:

- Extract information exactly as it appears in the resume. Do not infer, assume, or fabricate missing details.
- If a field is not mentioned, leave it empty (or return an empty list if the schema expects a list, or null for a single optional field).
- Preserve the original wording whenever practical.
- Do not summarize unless the schema explicitly requires a brief description.
- Ignore formatting, page numbers, headers, footers, and decorative elements that do not contain relevant information.

Extraction guidelines:

- Details
    - Full Name: Extract the candidate's full name.
    - Email: Extract the candidate's email address.
    - Phone: Extract the candidate's phone number, preserving the original format (including country code if present).
    - Address: Extract the candidate's residential or mailing address if explicitly stated. Do not infer a city/country from context (e.g., phone country code or institution location) if no address is actually written.
    - Profile URLs: Extract ONLY the candidate's core identity/profile links — their own LinkedIn, GitHub, portfolio/personal website, Kaggle, LeetCode, HuggingFace, Codeforces, HackerRank, Medium, or similar profile pages. These are links that represent the candidate's overall online presence, not links tied to a single project or achievement.
    - Reference URLs: Extract all OTHER URLs found anywhere in the resume that are not core profile links — including individual project repository links, deployed app/demo links, certification or credential links, video demonstrations, published papers, datasets, or any other supporting link tied to a specific project, certification, or achievement.
    - If a section titled "PROFILE LINKS" is provided separately with raw URLs, use those as the authoritative source for matching label-only mentions (e.g. "LinkedIn" as plain text with no URL) found elsewhere in the resume — classify each into profile_urls or reference_urls based on what it actually links to, not just because it appeared in that injected section.
    - Institutions: Extract all educational institutions attended, including schools, colleges, universities, and other training institutions, exactly as named in the resume.
    - Educations: Extract all the degrees obtained by the candidate along with CGPA/percentage or any other metric of evaulation. If separated by comma, its generally 2 different degrees
- Skills
    - Extract all technical and professional skills mentioned.
    - Include programming languages, frameworks, libraries, databases, cloud platforms, developer tools, operating systems, technologies, and other relevant competencies.
    - Do not include soft skills unless they are explicitly listed as skills.
- Projects
    - Extract every project mentioned.
    - For each project, include:
        - Project name
        - Description (if provided)
        - Technologies used — extract ALL technologies, frameworks, libraries, tools, algorithms, or platforms mentioned anywhere in that project's description, not just ones in a separate "tech used" line. If the skill/tool/algorithm is named within the description text itself, include it here even if it's not repeated in a dedicated list.
- Experience (If no experience section is found, DO NOT INVENT YOUR OWN)
    - Extract every professional experience, internship, freelance role, research position, teaching position, or other work experience.
    - For each experience, include:
        - Company or organization
        - Role or position
        - Employment dates
        - Description of responsibilities or achievements (if provided)
- Achievements
    - Extract all achievements, awards, certifications, scholarships, honors, publications, competition results, and other notable accomplishments as separate list items, splitting any comma-separated or run-on groupings into individual entries.

Output requirements:

- Return only structured data matching the provided schema.
- Do not include explanations, markdown, comments, or additional text.
- Do not invent missing values.
- If multiple values exist for a field, include all of them.
"""

####################### Node ######################
def resume_extraction(state: ResumeState, config: RunnableConfig, *, store: BaseStore):
    resume_text = state.get("resume_text")
    if not resume_text:
        raise ValueError("No resume_text found in state, nothing to extract from.")

    user_id = config["configurable"]["user_id"]

    prompt = (
        f"{resume_extraction_parser.get_format_instructions()}\n\n"
        f"{SYSTEM_PROMPT_FOR_RESUME_EXTRACTION}\n\n"
        f"RESUME TEXT:\n{resume_text}"
    )

    output = llm.invoke(prompt)
    facts: ResumeFact = resume_extraction_parser.parse(output.content)

    ns = ("user", user_id, "resume_facts")
    store.put(ns, "current", {"data": facts.model_dump()})

    return {"resume_facts": facts}

###################### Build graph #####################
builder = StateGraph(ResumeState)
builder.add_node('extract_resume', resume_extraction)

builder.add_edge(START, 'extract_resume')
builder.add_edge('extract_resume', END)

DB_URI = "postgresql://postgres:postgres@localhost:54320/postgres?sslmode=disable"

def process_resume(file_path: str, user_id: str) -> str:
    resume_text = extract_resume_text(file_path)
    links = extract_links(file_path)

    if links:
        resume_text += "\n\nPROFILE LINKS:\n" + "\n".join(links)

    with PostgresStore.from_conn_string(DB_URI) as store:
        store.setup()
        graph = builder.compile(store=store)
        config = {"configurable": {"user_id": user_id}}
        out = graph.invoke({"resume_text": resume_text}, config)

    return out["resume_facts"].model_dump_json(indent=2)
