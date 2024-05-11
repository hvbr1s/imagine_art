from crewai import Task
from crew.agents import art_designer, mad_artist

# Research task
add_randomness= Task(
  description=(
    """
    Based on the provided prompt: {topic}. 
    Write a new sentence that adds randomness to the prompt.
    """
  ),
  expected_output="The provided prompt and the added sentence, separated by a period.  Provide ONLY the prompt and added sentence without any other information or comments",
  agent=art_designer,
  async_execution=False,
)

imagine = Task(
  description=(
    """
Based on the provided prompt, refine it to make it artistic.
    """
  ),
  expected_output="A unique, creative prompt that can be used to generate AI art. Provide ONLY the prompt without any other information or comments",
  agent=mad_artist,
  async_execution=False,
  context=[add_randomness]
)



    # A SHORT answer to this question: '{topic}'. Your answer MUST be friendly and engaging but ALWAYS be 3 sentences or less. 
    # Use the provided documentation to inform your response.
    # For more information, ALWAYS direct the customer to the official Ledger resources. Encourage visiting the Ledger store at https://shop.ledger.com/ for product purchases and the Ledger Academy at https://www.ledger.com/academy for educational content. 
    # ALWAYS insert a line break before directing the customer to the Ledger store or Ledger Academy.