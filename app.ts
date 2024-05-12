import express from 'express';
import OpenAI from 'openai';
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { Metaplex, keypairIdentity, bundlrStorage, toMetaplexFile, toBigNumber } from "@metaplex-foundation/js";
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import secret from '/home/dan/ts_imagine/guideSecret.json';
import dotenv from 'dotenv';
const Groq = require("groq-sdk");
import { stringify } from 'querystring';
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

const openai = new OpenAI({
  apiKey: process.env['OPENAI_API_KEY'],
});

const groq = new Groq({
    apiKey: process.env['GROQ_API_KEY']
});

async function askGroq(userPrompt: string) {
  const groqResponse = await groq.chat.completions.create({
      messages: [
          {
              role: "system",
              content: `
              Rewrite and expand the following prompt to enhance its artistic qualities and uniqueness: '${userPrompt}'
              Please return the prompt without any added comments, title or information
              `
          },
          {
              role: "user",
              content: userPrompt
          }
      ],
      model: "llama3-8b-8192"
  });

  // Print the completion returned by the LLM.
  const groqContent = JSON.stringify(groqResponse.choices[0]?.message?.content || "");
  return groqContent;
}


///// NFT LOGIC

const CONFIG = {
  uploadPath: '/home/dan/ts_imagine/image/',
  imgFileName: 'image.png',
  imgType: 'image/png',
  imgName: 'cat',
  description: "Cats they're cute!",
  attributes: [
      {trait_type: 'Paws', value: 'Sharp!'},
  ],
  sellerFeeBasisPoints: 500,//500 bp = 5%
  symbol: 'CATS',
  creators: [
      {address: WALLET.publicKey, share: 100}
  ]
};

async function uploadImage(filePath: string,fileName: string): Promise<string>  {
  console.log(`Step 1 - Uploading Image`);
  const imgBuffer = fs.readFileSync(filePath + fileName);
  const imgMetaplexFile = toMetaplexFile(imgBuffer,fileName);
  const imgUri = await METAPLEX.storage().upload(imgMetaplexFile);
  return imgUri;

}

async function imagine(userPrompt: string) {
  const response = await openai.images.generate({
    model: "dall-e-3",
    prompt: userPrompt + ' . The resulting image should look hand-drawn with watercolor colors. Begin!',
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
  const imagePath = path.join('/home/dan/ts_imagine/image', 'image.png');

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

  const groqSays = await askGroq(userPrompt)
  console.log(`Groq prompt -> ${groqSays}`)

  try {
    const imageLocation = await imagine(groqSays);
    console.log(`Image succesfully created and stored in: ${imageLocation}`);
    const imageUri = await uploadImage(imageLocation, "")
    console.log(`Image URI -> ${imageUri}`)
    const metadataUri = await uploadMetadata(imageUri, CONFIG.imgType, CONFIG.imgName, CONFIG.description, CONFIG.attributes); 
    console.log(metadataUri)
    const minter = mintNft(metadataUri, CONFIG.imgName, CONFIG.sellerFeeBasisPoints, CONFIG.symbol, CONFIG.creators);
    console.log(minter)
    return minter;
  } 
  catch (error) {
    res.status(500).send('Error processing your request');
  }

});


// Start the server
app.listen(port, () => {
    console.log(`Listening at http://localhost:${port}/`);
});

export default app;


// test: curl "http://localhost:8800/imagine?user_prompt=a%20cat%20on%20a%20roof"