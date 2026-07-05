from pydantic import BaseModel, Field
from typing import Optional

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
    education: list[str] = Field(default_factory=list, description="All Degrees obtained by the candidate along with the CGPA/percentage or any metrics of evaluation they obtained.")

class Experience(BaseModel):
    company: str | None = None
    role: str | None = None
    dates: str | None = None
    description: str | None = None

class Project(BaseModel):
    name: str
    description: str | None = None
    technologies: list[str] = Field(default_factory=list, description="Please mention all the relevant technologies used to make the project, go through the description and figure out yourself as well.")

class ResumeFact(BaseModel):
    details: Details = Field(description="Personal, contact, profile, and educational information of the candidate.")
    skills: list[str] = Field(default_factory=list, description="All technical and professional skills mentioned in the resume, including programming languages, frameworks, libraries, tools, databases, cloud platforms, operating systems, and other relevant technologies.")
    projects: list[Project] = Field(default_factory=list, description="All projects mentioned in the resume. Include the project name, description, and technologies used if available.")
    experience: list[Experience] = Field(default_factory=list, description="All professional experiences mentioned in the resume. Include the company name, job role, employment dates, and a brief description of responsibilities or accomplishments if provided.")
    achievements: list[str] = Field(default_factory=list, description="All achievements, awards, certifications, scholarships, recognitions, competition results, publications, or other notable accomplishments mentioned in the resume.")