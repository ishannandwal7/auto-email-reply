const express=require('express');
const app=express();
const port=3000;
const path=require('path');
const fs=require('fs').promises;
const {authenticate}= require('@google-cloud/local-auth');
const {google}=require('googleapis');
const LABLE_NAME='vacation';

const SCOPES=[
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.labels',
    'https://mail.google.com/'
]

app.get('/',async(req,res)=>{

    //load cliennt secrets from local file;
    const credentials=await fs.readFile('credentials.json');

    //authorizee a client with crendrial then call gmail api
    const auth =await authenticate({
        keyfilePath: path.join(__dirname,'credentials.json'),
        scopes:SCOPES,
    });

    console.log("this is auth",auth);

    const gmail=google.gmail({
        version:"v1",
        auth
    });
    
    const response=await gmail.users.labels.list({
        userId: 'me'
    });


    //load crednetial from file
    async function loadcredentials(){
        const filepath=path.join(process.cwd(),'credetials.json');
        const content=await fs.readFile(filepath,{encoding:'utf-8'});
        return JSON.parse(content);
    } 


    // get messeges that have no prior replies
    async function getUnrepliedMessages(auth){
        const gmail=google.gmail({
            version:"v1",
            auth
        });
        const res=await gmail.users.messages.list({
            userId: 'me',
            q:'-in:chats -from:me -has:userlabels',
        });
        return res.data.messages || [];
    }

    // send reply to a message
    async function sendReply(auth,message){
        const gmail=google.gmail({
            version:"v1",
            auth
        });
        const res=await gmail.users.messages.get({
            userId: 'me',
            id:message.id,
            format:'metadata',
            metadataHeaders:['Subject','From'],
        });
        const subject=res.data.payload.headers.find(
            (header)=>header.name=='Subject'
        ).value;
        const from=res.data.payload.headers.find(
            (header)=>header.name=='From'
        ).value;
        const replyto=from.match(/<(.*)>/)[1];
        const replySubject=subject.startsWith('Re:')? subject:`Re: ${subject}`;
        const replybody=`testing `;
        const rawMessage=[
            `From: me`,
            `To: ${replyto}`,
            `Subject: ${replySubject}`,
            `Content-Type: text/plain; charset="UTF-8"`,
            `In-Reply-To:${message.id}`,
            `References:${message.id}`,
            ``,
            replybody,
        ].join('\n');
        const encodedMessage=Buffer.from(rawMessage).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/\=+$/,'');
        await gmail.users.messages.send({
            userId:'me',
            requestBody:{
                raw:encodedMessage,
            },
        });
    }

    async function createLabel(auth){
        const gmail=google.gmail({version:"v1",auth});
        try {
            const res=await gmail.users.labels.create({
                userId: 'me',
                requestBody:{
                    name: LABLE_NAME,
                    labelListVisibility:'labelShow',
                    messageListVisibility:'show',
                }
            });
            return res.data.id;
        } catch (error) {
            if(error.code===409){
                //label already exits
                const res=await gmail.users.labels.list({
                    userId: 'me',
                });
                const label=res.data.labels.find((label)=>label.name==LABLE_NAME);
                return label.id;

            }
            else{
                throw error;
            }
        }
    }

    //addding labels 
    async function addLabel(auth,message,labelId){
        const gmail=google.gmail({version:"v1",auth});
        await gmail.users.messages.modify({
            userId: 'me',
            id:message.id,
            requestBody:{
                addLabelIds: [labelId],
                removeLabelIds:['INBOX'],
            },
        })
    }
    //main function
    async function main(){
        // creae a label for app
        const labelId=await createLabel(auth);
        console.log(`created or found lavel with label id ${labelId}`);

        //repeat the folluwont steps in inntervalss
        setInterval(async ()=>{
            //get messages that hav no prior replies
            const messages=await getUnrepliedMessages(auth);
            console.log(`found ${messages.length} unrepled messages`);

            //      await sendReply(auth,messages[0]);
            //     console.log(`send reply to message with id ${messages[0].id}`);
            //     // add lavbel to message and move it to label folder
            //     await addLabel(auth,messages[0],labelId);
            //     console.log(`added label to message with id ${messages[0].id}`);
            // // console.log(messages[0],"firs message");

            for(const message of messages){
                await sendReply(auth,message);
                console.log(`send reply to message with id ${message.id}`);

                // add lavbel to message and move it to label folder
                await addLabel(auth,message,labelId);
                console.log(`added label to message with id ${message.id}`);

            }
        },45000);
    }
    main().catch(console.error);
    const labels=response.data.labels;
    res.send('you have successuly subscribed to service');
});
app.listen(port);