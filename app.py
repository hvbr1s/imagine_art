import os
from dotenv import main
from fastapi.security import APIKeyHeader
from fastapi import FastAPI, HTTPException, Depends
from crew.agents import art_designer, mad_artist
from tasks.list import add_randomness, imagine
from crewai import Crew, Process
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from fastapi import Request
from pydantic import BaseModel
from openai import AsyncOpenAI
from dotenv import main

# Initialize environment variables
main.load_dotenv()

# Initialize backend API keys
server_api_key=os.environ['BACKEND_API_KEY']  
api_key_header = APIKeyHeader(name="Authorization", auto_error=False)

async def get_api_key(api_key_header: str = Depends(api_key_header)):
    if not api_key_header or api_key_header.split(' ')[1] != server_api_key:
        raise HTTPException(status_code=401, detail="Could not validate credentials")
    return api_key_header

# Initialize OpenAI client & Embedding model
openai_key = os.environ['OPENAI_API_KEY']
openai_client = AsyncOpenAI(api_key=openai_key)
gpt = 'gpt-4-turbo'

# Initialize Groq client
from groq import Groq
groq_client = Groq(
    api_key=os.environ["GROQ_API_KEY"],
)
llama = 'llama3-8b-8192'

# Define query class
class Query(BaseModel):
    user_input: str
    user_id: str | None = None
    user_locale: str | None = None
    platform: str | None = None


# Initialize app
app = FastAPI()

# Ready the crew
crew = Crew(
  agents=[art_designer, mad_artist],
  tasks=[add_randomness, imagine],
  process=Process.sequential,
  verbose= 1,
)

# Agent handling function
async def agent(task):
    print(f"Processing task-> {task}")
    response = crew.kickoff(inputs={"topic": task})
    return response

# RAGChat route
@app.post('/imagine') 
#async def react_description(query: Query, api_key: str = Depends(get_api_key)): 
async def react_description(query: Query): # to demonstrate the UI 

    # Deconstruct incoming query
    user_id = query.user_id
    user_input = query.user_input.strip()

    res = await agent(user_input) # use CrewAI

    response = await openai_client.images.generate(
        model="dall-e-3",
        prompt=res,
        size="1024x1024",
        quality="standard",
        n=1,
    )

    image_url = response.data[0].url
    print(image_url)
                    
    # Return response to user
    return {'output': image_url}
    
    

# UI
templates = Jinja2Templates(directory="templates")
app.mount("/static", StaticFiles(directory="static"), name="./static/BBALP00A.TTF")
@app.get("/", response_class=HTMLResponse)
async def root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

# Local start command: uvicorn app:app --reload --port 8800
    
