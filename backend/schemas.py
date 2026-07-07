#--------------------------------------#
# All schemas required for the project #
#--------------------------------------#

from pydantic import BaseModel, Field
from typing import Optional
# Specifying todays date
from datetime import datetime
todays_date = datetime.now().strftime("%B %d, %Y")

##################### JD Scraper schemas ######################
class JDRequirement(BaseModel):
    text: str = Field(description="The specific requirement, qualification, responsibility, or cultural trait as stated in the posting.")
    category: str = Field(description="One of: 'must_have', 'nice_to_have', 'responsibility', or 'culture_fit'.")
    skill_area: str = Field(description="Short label for the general area, e.g. 'programming_language', 'systems', 'cloud', 'soft_skill', 'domain_knowledge', 'values'.")


class RefinedJD(BaseModel):
    role_title: str = Field(description="The specific job title of the primary posting.")
    company: str = Field(description="Company name.")
    location: str | None = Field(default=None, description="Job location, e.g. city/remote/hybrid, if stated.")
    employment_type: str | None = Field(default=None, description="e.g. 'Full-Time', 'Internship', 'Contract', if stated.")
    compensation: str | None = Field(default=None, description="Salary, stipend, or equity range if explicitly mentioned.")
    company_summary: str | None = Field(default=None, description="Brief description of what the company does, in the posting's own words, condensed.")
    requirements: list[JDRequirement] = Field(default_factory=list, description="All must-haves, nice-to-haves, responsibilities, and culture-fit statements extracted as individual items.")
    tech_stack: list[str] = Field(default_factory=list, description="All explicitly named technologies, languages, frameworks, or tools mentioned as part of the role or stack.")
    application_method: str = Field(description="'platform' if applied directly through the site the JD was scraped from, 'external_form' if the posting redirects elsewhere to apply, 'unclear' if not stated.")
    external_application_url: str | None = Field(default=None, description="The URL to apply externally, only present if application_method is 'external_form'.")

#################### Resume extractor schemas ###################

class Details(BaseModel):
    full_name: str | None = Field(default=None, description="Full name of the candidate.")
    email: str | None = Field(default=None, description="Email address of the candidate.")
    phone: str | None = Field(default=None, description="Phone number of the candidate.")
    address: str | None = Field(default=None, description="Residential or mailing address of the candidate.")
    profile_urls: list[str] = Field(default_factory=list, description="Core identity/profile URLs only — the candidate's own LinkedIn, GitHub, portfolio/personal website, Kaggle, LeetCode, HuggingFace, Codeforces, HackerRank, Medium, or similar profile pages.")
    reference_urls: list[str] = Field(default_factory=list, description="All other URLs mentioned in the resume that are NOT core profile links — e.g. individual project repo links, deployed app/demo links, certification/credential links, video demos, published papers, datasets, or any other supporting reference link tied to a specific project or achievement.")
    institutions: list[str] = Field(default_factory=list, description="All educational institutions attended by the candidate, including schools, colleges, universities, and other training institutions.")
    education: list[str] = Field(default_factory=list, description="All Degrees obtained by the candidate along with Passing year or duration of degree mentioned and the CGPA/percentage or any metrics of evaluation they obtained.")

class Experience(BaseModel):
    company: str | None = None
    role: str | None = None
    dates: str | None = None
    description: str | None = None

class Project(BaseModel):
    title: str
    description: str | None = None
    technologies: list[str] = Field(default_factory=list, description="Please mention all the relevant technologies used to make the project, go through the description and figure out yourself as well.")

class ResumeFact(BaseModel):
    details: Details = Field(description="Personal, contact, profile, and educational information of the candidate.")
    skills: list[str] = Field(default_factory=list, description="All technical and professional skills mentioned in the resume, including programming languages, frameworks, libraries, tools, databases, cloud platforms, operating systems, and other relevant technologies.")
    projects: list[Project] = Field(default_factory=list, description="All projects mentioned in the resume. Include the project name, description, and technologies used if available.")
    experience: list[Experience] = Field(default_factory=list, description="All professional experiences mentioned in the resume. Include the company name, job role, employment dates, and a brief description of responsibilities or accomplishments if provided.")
    achievements: list[str] = Field(default_factory=list, description="All achievements, awards, certifications, scholarships, recognitions, competition results, publications, or other notable accomplishments mentioned in the resume.")

############################## Tailored content generator schemas ############################
# Generating resume
class TailoredResumeContent(BaseModel):
    summary: str = Field(description="A short resume summary of about 2-3 sentences focusing on the role that is mentioned in job description, do not invent any details. You can only use details provided in the resume. Mention the word 'Aspiring' infront of the job role which the client is applying for if and only if client has no experience in that role else ignore this. keep descriptions concise, avoid adding descriptive filler adjectives. One more important thing is that it should read more naturally.")
    details: Details = Field(description="Personal, contact, profile, and educational information of the candidate.")
    skills: list[str] = Field(default_factory=list, description="A subset of the skills from the original resume's skills list that are relevant to the job description. You MUST NOT add, infer, or include any skill, tool, or technology that is not verbatim present in the original skills list, even if it seems implied by the projects, experience, or job description. For example, if 'Natural Language Processing' or 'Prompt Engineering' or 'Google Cloud' are not explicitly listed in the original skills, do not include them, even if the candidate's projects involve NLP or cloud work. Only reorder or filter the existing list — never expand it.")
    projects: list[Project] = Field(default_factory=list, description="All projects mentioned in the resume. Include the project name, description, and technologies used if available. Tailor the description so that it fits the job description provided. Do not invent your own details.")
    experience: list[Experience] = Field(default_factory=list, description="All professional experiences mentioned in the resume. Include the company name, job role, employment dates, and a brief description of responsibilities or accomplishments if provided. Tailor the description so that it fits the job description provided. Do not invent your own details.")
    achievements: list[str] = Field(default_factory=list, description="All achievements, awards, certifications, scholarships, recognitions, competition results, publications, or other notable accomplishments mentioned in the resume.")

# Generating cover letter
class CoverLetterHeader(BaseModel):
    full_name: str | None = Field(default=None, description="Full name of the candidate.")
    email: str | None = Field(default=None, description="Email address of the candidate.")
    phone: str | None = Field(default=None, description="Phone number of the candidate.")
    address: str | None = Field(default=None, description="Residential or mailing address of the candidate.")
    date: str = Field(default=todays_date, description="You can only use what is provided by default, Do not put your own date")


class CoverLetterEmployer(BaseModel):
    hiring_manager_name: str | None = Field(default=None, description="Full name of the hiring manager")
    hiring_manager_title: str | None = Field(default=None, description="Job title of the hiring manager, if known.")
    company_name: str | None = Field(default=None, description="Company name")
    company_address: str | None = Field(default=None, description="Company address/location if mentioned")


class CoverLetterBodyParagraph(BaseModel):
    content: str = Field(description="A body paragraph connecting the applicant's skills and experience to the job requirements, often including a specific example or accomplishment.")


class CoverLetter(BaseModel):
    header: CoverLetterHeader = Field(description="The applicant includes their contact information (name, phone, email, sometimes address) and the date.")
    employers_info: CoverLetterEmployer = Field(description="List the hiring manager's name (if known), their title, the company name, and the company address.")
    salutation: str = Field(description="The applicant opens with a greeting like 'Dear [Name of the hiring manager].' If they don't have a specific name, 'Dear Hiring Manager'")
    opening_paragraph: str = Field(description="States the position being applied for and grabs attention, often with a hook such as a notable achievement, genuine enthusiasm for the company, or a mutual connection referral.")
    body_paragraphs: list[CoverLetterBodyParagraph] = Field(description="One or two paragraphs forming the core of the letter, connecting skills/experience to the role and showing fit with the company's specific needs.")
    closing_paragraph: str = Field(description="Reaffirms interest in the role, briefly restates the applicant's value, and includes a call to action inviting further discussion.")
    sign_off: str = Field(default="Sincerely,", description="The closing valediction, e.g. 'Sincerely,' or 'Best regards,'")
    signature_name: str | None = Field(default=None, description="The applicant's name as it appears under the sign-off, typically matching full_name in the header.")