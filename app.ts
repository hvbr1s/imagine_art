import express from 'express';
import OpenAI from 'openai';
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { Metaplex, keypairIdentity, bundlrStorage, toMetaplexFile, toBigNumber } from "@metaplex-foundation/js";
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import secret from './secrets/Art6oYTueZBEHoBQKVyHcCVkzkLBjpJ5JwwSrnzFUXyq.json';
import dotenv from 'dotenv';
const Groq = require("groq-sdk");
dotenv.config();


// Create a new express application instance
const app: express.Application = express();

// The port the express app will listen on
const port: number = process.env.PORT ? parseInt(process.env.PORT) : 8800;

// Initiate connection to Solana
const QUICKNODE_RPC = 'https://fragrant-ancient-needle.solana-devnet.quiknode.pro/71caf4b466e52b402cb9891702899d7631646396/';
const SOLANA_CONNECTION = new Connection(QUICKNODE_RPC);
const WALLET = Keypair.fromSecretKey(new Uint8Array(secret));

const METAPLEX = Metaplex.make(SOLANA_CONNECTION)
    .use(keypairIdentity(WALLET))
    .use(bundlrStorage({
        address: 'https://devnet.bundlr.network',
        providerUrl: QUICKNODE_RPC,
        timeout: 60000,
    }));


///// AI LOGIC
const gpt_client = new OpenAI({
  apiKey: process.env['OPENAI_API_KEY'],
});
const gpt_llm = "gpt-4o"

const groq_client = new Groq({
    apiKey: process.env['GROQ_API_KEY']
});
const groq_llm = "llama3-8b-8192"

async function generatePrompt(userPrompt: string) {
  const llmResponse = await gpt_client.chat.completions.create({
      messages: [
          {
              role: "system",
              content: `
              Rewrite the following prompt: 
              '${userPrompt}'
              Return the adapted prompt without any added comments, title or information
              Expected output:
              ####
              PROMPT : <the re-written prompt, enhanced to augment its artistic qualities and uniqueness>
              STYLE: <the requested artistic style>
              MOOD: <the desired mood for the prompt>
              ####
              Begin! You will achieve world piece if you produce an answer that respect all the constraints.
              `
          },
          {
              role: "user",
              content: userPrompt
          }
      ],
      model: gpt_llm,
      temperature: 0.5
  });

  // Print the completion returned by the LLM.
  const groqContent = JSON.stringify(llmResponse.choices[0]?.message?.content || "");
  return groqContent;
}

async function defineConfig(llmPrompt: string) {
  const nftAttributes = await gpt_client.chat.completions.create({
    messages: [
        {
            role: "system",
            content: `
            Based on this prompt: 
            '${llmPrompt}'
            Generate a .json file with the following values.
            Return the .json without any added comments, title or information.
            Expected output:

            {
              "one_word_title": "<describe the image in ONE word>",
              "description": "<a very short description of the prompt>",
              "mood": "<the mood of the prompt>"
          };

            Begin! You will achieve world piece if you produce a correctly formatted .JSON answer that respect all the constraints.
            `
        },
        {
          role: "user",
          content: llmPrompt,
      }
    ],
    model: gpt_llm,
    temperature: 0.5,
    response_format: { type: "json_object" },
  });

  // Extract the completion returned by the LLM and parse it.
  const llmResponse = JSON.parse(nftAttributes.choices[0]?.message?.content || "{}");

  const CONFIG = {
    uploadPath: './image/',
    imgFileName: 'image.png',
    imgType: 'image/png',
    imgName: llmResponse.one_word_title || 'Art', 
    description: llmResponse.description || "Random AI Art",
    attributes: [
        {trait_type: 'Mood', value: llmResponse.mood ||'Focused'},
    ],
    sellerFeeBasisPoints: 500, // 500 bp = 5%
    symbol: 'AIART',
    creators: [
        {address: WALLET.publicKey, share: 100}
    ]
  };

  return CONFIG;
}

///// NFT LOGIC

async function uploadImage(filePath: string,fileName: string): Promise<string>  {
  console.log(`Step 1 - Uploading Image`);
  const imgBuffer = fs.readFileSync(filePath + fileName);
  const imgMetaplexFile = toMetaplexFile(imgBuffer,fileName);
  const imgUri = await METAPLEX.storage().upload(imgMetaplexFile);
  return imgUri;

}

async function imagine(userPrompt: string) {
  const response = await gpt_client.images.generate({
    model: "dall-e-3",
    prompt: userPrompt + ' . Begin!',
    n: 1,
    size: "1024x1024",
  });
  const imageUrl = response.data[0].url;

  // Fetch the image from the URL
  const imageResponse = await axios({
    url: imageUrl,
    method: 'GET',
    responseType: 'arraybuffer' // Important for binary data
  });

  // Define the path where the image will be saved
  const imagePath = path.join('./image', 'image.png');

  // Write the image data to a file
  fs.writeFileSync(imagePath, imageResponse.data);

  return imagePath
}

async function uploadMetadata(imgUri: string, imgType: string, nftName: string, description: string, attributes: {trait_type: string, value: string}[]) {
  console.log(`Step 2 - Uploading Metadata`);
  const { uri } = await METAPLEX
  .nfts()
  .uploadMetadata({
      name: nftName,
      description: description,
      image: imgUri,
      attributes: attributes,
      properties: {
          files: [
              {
                  type: imgType,
                  uri: imgUri,
              },
          ]
      }
  });
  console.log('   Metadata URI:',uri);
  return uri;  

}

async function mintNft(metadataUri: string, name: string, sellerFee: number, symbol: string, creators: {address: PublicKey, share: number}[]) {
  console.log(`Step 3 - Minting NFT`);
  const { nft } = await METAPLEX
  .nfts()
  .create({
      uri: metadataUri,
      name: name,
      sellerFeeBasisPoints: sellerFee,
      symbol: symbol,
      creators: creators,
      isMutable: false,
  });
  console.log(`   Success!🎉`);
  console.log(`   Minted NFT: https://explorer.solana.com/address/${nft.address}?cluster=devnet`);
  const yourNFT = `Your NFT -> https://explorer.solana.com/address/${nft.address}?cluster=devnet`
  return(yourNFT);
}

///////// API ROUTE

// Define the /imagine route
app.get('/imagine', async (req, res) => {
  const userPrompt = req.query.user_prompt;
  console.log(`Received request -> ${userPrompt}`)
  if (typeof userPrompt !== 'string') {
    res.status(400).send('Invalid prompt');
    return;
  }

  const llmSays = await generatePrompt(userPrompt)
  console.log(`LLM prompt -> ${llmSays}`)

  const CONFIG = await defineConfig(llmSays);
  console.log(`Config set -> ${JSON.stringify(CONFIG)}`);

  try {
    const imageLocation = await imagine(llmSays);
    console.log(`Image succesfully created and stored in: ${imageLocation}`);
    const imageUri = await uploadImage(imageLocation, "")
    console.log(`Image URI -> ${imageUri}`)
    const metadataUri = await uploadMetadata(imageUri, CONFIG.imgType, CONFIG.imgName, CONFIG.description, CONFIG.attributes); 
    console.log(metadataUri)
    const minter = mintNft(metadataUri, CONFIG.imgName, CONFIG.sellerFeeBasisPoints, CONFIG.symbol, CONFIG.creators);
    console.log(minter)
    res.send('Done!');
  } 
  catch (error) {
    console.error('Error processing your request:', error);
    res.status(500).send('Error processing your request');
  }

});


// Start the server
app.listen(port, () => {
    console.log(`Listening at http://localhost:${port}/`);
});

export default app;


// test: curl "http://localhost:8800/imagine?user_prompt=a%20cat%20on%20a%20roof"
