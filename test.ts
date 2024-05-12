import axios from 'axios';
import * as readline from 'readline';

// Create readline interface for user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Function to encode user prompt for URL
const encodePrompt = (prompt: string): string => {
    return encodeURIComponent(prompt);
};

// Function to send request to the API
const sendRequest = async (prompt: string) => {
    const encodedPrompt = encodePrompt(prompt);
    const url = `http://localhost:8800/imagine?user_prompt=${encodedPrompt}`;

    try {
        const response = await axios.get(url);
        console.log('Response:', response.data);
    } catch (error) {
        if (error instanceof Error) {
            console.error('Error:', (error as any).response?.data || error.message);
        }
    }
};

// Prompt user for input
rl.question('Enter your prompt: ', (prompt) => {
    sendRequest(prompt).then(() => {
        rl.close();
    });
});
