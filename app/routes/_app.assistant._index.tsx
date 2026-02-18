import type { ActionFunctionArgs, LoaderFunctionArgs, SerializeFrom } from '@remix-run/node';

import { json } from '@remix-run/node';
import { useFetcher, useLoaderData } from '@remix-run/react';
import { Bot, Send, User, Loader2 } from 'lucide-react';
import OpenAI from 'openai';
import { useEffect, useRef, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { assertAuthUser } from '~/auth.server';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '~/components/ui/accordion';
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar';
import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';
import { Textarea } from '~/components/ui/textarea';
import { cn } from '~/lib/utils';
import { searchGlossaries } from '~/services/glossary.service';
import { tokenizer } from '~/services/tokenizer.service';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

// Tool implementations
const crawlWebsite = async (text: string): Promise<string> => {
  try {
    const url = new URL(`/cgi-bin/search-ddb4.pl?Terms=${encodeURIComponent(text)}`, 'http://www.buddhism-dict.net');
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Basic ${btoa('guest:')}`,
      },
    });

    if (response.ok) {
      const html = await response.text();
      // Parse HTML to extract relevant glossary information
      const bodyMatches = html.match(/Entry body matches for[\s\S]*?(?=<hr|$)/i);
      if (bodyMatches) {
        // Extract first 5 page links
        const linkMatches = bodyMatches[0].match(/href="([^"]+)"/g);
        if (linkMatches && linkMatches.length > 0) {
          // Get first link content
          const firstLink = linkMatches[0].replace(/href="|"$/g, '');
          const pageUrl = new URL(firstLink, 'http://www.buddhism-dict.net');
          const pageResponse = await fetch(pageUrl, {
            method: 'GET',
            headers: {
              Authorization: `Basic ${btoa('guest:')}`,
            },
          });

          if (pageResponse.ok) {
            const pageHtml = await pageResponse.text();
            // Strip HTML tags and return clean text
            return pageHtml.replace(/<[^>]+>/g, '').trim();
          }
        }
      }
    }
    return 'No results found from external dictionary';
  } catch (error) {
    console.error('Error crawling website:', error);
    return 'Error accessing external dictionary';
  }
};

const transformText = async (text: string, category: string): Promise<string> => {
  if (!process.env.OPENAI_API_KEY) {
    return text; // Return original text if API not available
  }

  try {
    const transformPrompt = `
You are a specialized text transformation agent for Buddhist content. Clean and extract the main content from the user query.

For Translation Requests:
- Remove phrases like "please translate", "help me translate", "can you translate", etc.
- Remove any surrounding commentary or questions
- Preserve the actual text that needs translation

For Glossary Lookups:
- Remove phrases like "what does X mean", "explain the term", "define", etc.
- Extract just the Buddhist term or short phrase to be looked up

Be conservative in removal - when in doubt, keep the content.
Return only the cleaned text without any explanation.
`;

    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      instructions: transformPrompt,
      input: `Category: ${category}\nText: ${text}`,
    });

    return response.output_text?.trim() || text;
  } catch (error) {
    console.error('Error transforming text:', error);
    return text;
  }
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await assertAuthUser(request);
  if (!user) {
    throw new Response('Unauthorized', { status: 401 });
  }
  return json({
    title: 'AI Assistant',
    user: {
      avatar: user.avatar,
    },
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const user = await assertAuthUser(request);
  if (!user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const message = body.message.trim().slice(0, 150);
  const sourceLang = user.originLang;
  const targetLang = user.targetLang;

  console.log({ sourceLang, targetLang, message, userId: user.id });

  if (!message) {
    return json({ error: 'Empty message' }, { status: 400 });
  }

  // Check API key availability
  if (!process.env.OPENAI_API_KEY) {
    return json({ error: 'OpenAI API key not configured' }, { status: 500 });
  }

  try {
    // Step 1: Classify the input using Responses API
    const classificationPrompt = `
You are a Buddhist text classification system. Analyze the user input and classify it into one of these categories:

1. **translation**: Substantial text blocks (>10 characters), explicit translation requests, complete passages or sutra excerpts
2. **glossary**: Single terms, short phrases (≤10 characters), terminology questions, queries without punctuation
3. **clarification**: Ambiguous requests, moderate-length text with unclear purpose
4. **nonsupport**: Unsupported languages (only supports: english, chinese, sanskrit, indonesian)
5. **unknown**: Non-Buddhist content or unrelated queries

User languages: ${sourceLang} to ${targetLang}

Classify this input and provide reasoning. Return a JSON object with 'category' and 'reasoning' fields.
`;

    const classification = await client.responses.create({
      model: 'gpt-4o-mini',
      instructions: classificationPrompt,
      input: message,
    });

    let classificationData;
    try {
      classificationData = JSON.parse(classification.output_text || '{}');
    } catch {
      classificationData = { category: 'unknown', reasoning: 'Failed to parse classification' };
    }

    const category = classificationData.category;
    const reasoning = classificationData.reasoning;

    console.log(`Classification: "${category}" - ${reasoning}`);

    // Handle simple categories with streaming response
    if (category === 'nonsupport' || category === 'unknown' || category === 'clarification') {
      let simpleResponse = '';

      if (category === 'nonsupport') {
        simpleResponse = `Sorry, I only support translation between English, Chinese, Sanskrit, and Indonesian. Your current language pair (${sourceLang} to ${targetLang}) may not be supported.`;
      } else if (category === 'unknown') {
        simpleResponse =
          'I specialize in Buddhist text translation and terminology. Please provide Buddhist sutras, texts, or terminology for translation or explanation.';
      } else if (category === 'clarification') {
        simpleResponse =
          'Could you please be more specific? Are you looking for a translation of Buddhist text or an explanation of Buddhist terminology?';
      }

      // Return as streaming response for consistency
      const encoder = new TextEncoder();
      const responseStream = new ReadableStream({
        start(controller) {
          try {
            const encoded = encoder.encode(simpleResponse);
            controller.enqueue(encoded);
            controller.close();
          } catch (error) {
            controller.error(error);
          }
        },
      });

      const host = request.headers.get('host');

      if (host?.includes('localhost')) {
        return new Response(responseStream, {
          headers: {
            'Transfer-Encoding': 'chunked',
            'Content-Type': 'text/plain',
            'X-Content-Type-Options': 'nosniff',
            'X-Category': category,
          },
        });
      }

      return new Response(responseStream, {
        headers: {
          'Content-Type': 'text/plain',
          'X-Content-Type-Options': 'nosniff',
          'X-Category': category,
        },
      });
    }

    // Transform text first
    const transformedText = await transformText(message, category);
    console.log(`Transformed text: "${transformedText}"`);

    // For translation and glossary, use tool calling with streaming Responses API
    const encoder = new TextEncoder();

    let instructions = '';
    let toolResults = '';

    if (category === 'glossary') {
      // Step 1: Search internal glossary database
      let glossaryResults: Record<
        string,
        {
          definitions: string[];
          sutraTexts: Array<{ chinese?: string | null; english?: string | null; sutraName: string; volume: string }>;
        }
      > = {};
      try {
        // For Chinese text, use tokenizer; for English terms, search directly
        const hasChinese = /[\u4e00-\u9fff]/.test(transformedText);

        if (hasChinese && process.env.ANTHROPIC_API_KEY) {
          const tokens: string[] = await tokenizer(transformedText);
          if (tokens.length > 0) {
            const results = await searchGlossaries(tokens);
            glossaryResults = Array.isArray(results) ? {} : results;
            console.log('Internal glossary results (Chinese):', glossaryResults);
          }
        } else {
          // For English terms, search directly without tokenization
          const results = await searchGlossaries([transformedText]);
          glossaryResults = Array.isArray(results) ? {} : results;
          console.log('Internal glossary results (English):', glossaryResults);
        }
      } catch (error) {
        console.error('Error searching internal glossary:', error);
      }

      // Step 2: If no internal results, search external dictionary
      let externalResults = '';
      if (Object.keys(glossaryResults).length === 0) {
        try {
          externalResults = await crawlWebsite(transformedText);
          console.log('External dictionary results found');
        } catch (error) {
          console.error('Error crawling external dictionary:', error);
        }
      }

      // Prepare tool results for instructions and create source table
      let sourceTable = '';
      let sourceNote = '';

      if (Object.keys(glossaryResults).length > 0) {
        // Helper functions
        const truncateText = (text: string, maxLength: number = 50) => {
          if (!text) return 'N/A';
          return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
        };

        const highlightTerm = (text: string, termToHighlight: string) => {
          if (!text || !termToHighlight) return text;
          // Use regex to replace the term with highlighted version (case-insensitive)
          const regex = new RegExp(`(${termToHighlight})`, 'gi');
          return text.replace(regex, '**$1**');
        };

        // Create markdown table for internal glossary results
        sourceTable = '\n\n## 📚 **Glossary Sources Found**\n\n';
        sourceTable +=
          '| Definitions | Chinese Sutra Text | English Sutra Text |\n|-------------|-------------------|-------------------|\n';

        // Helper function for finding context around term
        const getContextAroundTerm = (text: string, searchTerm: string, contextLength: number = 80) => {
          if (!text || !searchTerm) return 'N/A';

          // Find the term in the text (case insensitive)
          const lowerText = text.toLowerCase();
          const lowerTerm = searchTerm.toLowerCase();
          const termIndex = lowerText.indexOf(lowerTerm);

          if (termIndex === -1) {
            // If term not found, just truncate normally
            return text.length > contextLength ? text.substring(0, contextLength) + '...' : text;
          }

          // Calculate start and end positions for context
          const halfContext = Math.floor((contextLength - searchTerm.length) / 2);
          const start = Math.max(0, termIndex - halfContext);
          const end = Math.min(text.length, termIndex + searchTerm.length + halfContext);

          let contextText = text.substring(start, end);

          // Add ellipsis if we're not at the beginning/end
          if (start > 0) contextText = '...' + contextText;
          if (end < text.length) contextText = contextText + '...';

          return contextText;
        };

        for (const [term, data] of Object.entries(glossaryResults)) {
          // Show all definitions in the first column, and create one row per unique sutra text
          const allDefinitions = data.definitions.join('; ');

          for (const sutraText of data.sutraTexts) {
            const chineseText = sutraText.chinese ? truncateText(sutraText.chinese) : 'N/A';
            const englishText = sutraText.english ? getContextAroundTerm(sutraText.english, term) : 'N/A';

            // Highlight the term in both Chinese and English texts
            const highlightedChinese = highlightTerm(chineseText, term);
            const highlightedEnglish = highlightTerm(englishText, term);

            sourceTable += `| ${allDefinitions} | ${highlightedChinese} | ${highlightedEnglish} |\n`;
          }
        }

        sourceNote =
          '\n\n*✅ **Source**: This explanation is based on verified entries from our internal Buddhist glossary database.*';
        toolResults = `\n\n### Internal Glossary Results:\n${JSON.stringify(glossaryResults, null, 2)}`;
      } else if (externalResults) {
        sourceNote =
          '\n\n*🌐 **Source**: This explanation is sourced from external Buddhist dictionary references, as no entries were found in our internal glossary.*';
        toolResults = `\n\n### External Dictionary Results:\n${externalResults}`;
      } else {
        sourceNote =
          '\n\n*🤖 **Source**: This explanation is generated by AI based on general Buddhist knowledge, as no specific entries were found in our glossary or external sources.*';
      }

      instructions = `
You are a Buddhist terminology expert. Provide a detailed explanation of the given Buddhist term.

For your explanation, provide:
1. Definition and meaning
2. Sanskrit/Pali origins if applicable  
3. Context of use in Buddhist texts
4. Related terms

After your explanation, you MUST include this exact source information:
${sourceTable}${sourceNote}

Format your response clearly and educationally.

### Term to explain: ${transformedText}

Languages: ${sourceLang} to ${targetLang}
${toolResults}
`;
    } else if (category === 'translation') {
      // Step 1: Tokenize text if it contains Chinese characters
      let tokens: string[] = [];
      const hasChinese = /[\u4e00-\u9fff]/.test(transformedText);

      if (hasChinese && process.env.ANTHROPIC_API_KEY) {
        try {
          tokens = await tokenizer(transformedText);
          console.log('Tokenized text:', tokens);
        } catch (error) {
          console.error('Error tokenizing text:', error);
        }
      }

      // Step 2: Search for glossary references
      let glossaryResults: Record<
        string,
        {
          definitions: string[];
          sutraTexts: Array<{ chinese?: string | null; english?: string | null; sutraName: string; volume: string }>;
        }
      > = {};
      if (tokens.length > 0) {
        try {
          const results = await searchGlossaries(tokens);
          glossaryResults = Array.isArray(results) ? {} : results;
          console.log('Glossary references found:', glossaryResults);
        } catch (error) {
          console.error('Error searching glossary for translation:', error);
        }
      }

      // Prepare tool results for instructions and create glossary table for translation
      let glossaryTable = '';
      let glossaryNote = '';

      if (Object.keys(glossaryResults).length > 0) {
        // Helper functions
        const truncateText = (text: string, maxLength: number = 50) => {
          if (!text) return 'N/A';
          return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
        };

        const highlightTerm = (text: string, termToHighlight: string) => {
          if (!text || !termToHighlight) return text;
          // Use regex to replace the term with highlighted version (case-insensitive)
          const regex = new RegExp(`(${termToHighlight})`, 'gi');
          return text.replace(regex, '**$1**');
        };

        // Create markdown table for translation glossary references
        glossaryTable = '\n\n## 📖 **Glossary References Used**\n\n';
        glossaryTable +=
          '| Definitions | Chinese Sutra Text | English Sutra Text |\n|-------------|-------------------|-------------------|\n';

        // Helper function for finding context around term
        const getContextAroundTerm = (text: string, searchTerm: string, contextLength: number = 80) => {
          if (!text || !searchTerm) return 'N/A';

          // Find the term in the text (case insensitive)
          const lowerText = text.toLowerCase();
          const lowerTerm = searchTerm.toLowerCase();
          const termIndex = lowerText.indexOf(lowerTerm);

          if (termIndex === -1) {
            // If term not found, just truncate normally
            return text.length > contextLength ? text.substring(0, contextLength) + '...' : text;
          }

          // Calculate start and end positions for context
          const halfContext = Math.floor((contextLength - searchTerm.length) / 2);
          const start = Math.max(0, termIndex - halfContext);
          const end = Math.min(text.length, termIndex + searchTerm.length + halfContext);

          let contextText = text.substring(start, end);

          // Add ellipsis if we're not at the beginning/end
          if (start > 0) contextText = '...' + contextText;
          if (end < text.length) contextText = contextText + '...';

          return contextText;
        };

        for (const [term, data] of Object.entries(glossaryResults)) {
          // Show all definitions in the first column, and create one row per unique sutra text
          const allDefinitions = data.definitions.join('; ');

          for (const sutraText of data.sutraTexts) {
            const chineseText = sutraText.chinese ? truncateText(sutraText.chinese) : 'N/A';
            const englishText = sutraText.english ? getContextAroundTerm(sutraText.english, term) : 'N/A';

            // Highlight the term in both Chinese and English texts
            const highlightedChinese = highlightTerm(chineseText, term);
            const highlightedEnglish = highlightTerm(englishText, term);

            glossaryTable += `| ${allDefinitions} | ${highlightedChinese} | ${highlightedEnglish} |\n`;
          }
        }

        glossaryNote =
          '\n\n*✅ **Note**: This translation incorporates verified definitions from our internal Buddhist glossary database.*';
        toolResults = `\n\n### Glossary References:\n${JSON.stringify(glossaryResults, null, 2)}\n\nUse these glossary references to inform your translation choices.`;
      }

      instructions = `
You are tasked with translating ancient ${sourceLang} Buddhist sutra text into ${targetLang}.
Your goal is to create a translation that is not only accurate but also elegant and poetic in tone.

Text to translate: ${transformedText}

Guidelines:
1. Approach with reverence for the original text, capturing both meaning and spiritual essence
2. Use a poetic tone with elevated vocabulary and rhythmic phrasing  
3. Ensure core meaning and teachings are accurately conveyed
4. Maintain respectful and reverent tone throughout
5. If glossary references are provided, use them to inform your translation choices

Present your translation with the markdown header ### Translation. 
Include translation notes after with the markdown header ### Thinking Notes, covering:
- Grammatical concerns  
- Cohesion of meaning
- Overall translation rationale
- How glossary references influenced translation choices

${glossaryTable ? `After your thinking notes, include this glossary information:${glossaryTable}${glossaryNote}` : ''}
${toolResults}
`;
    }

    // Create streaming response with Responses API
    const stream = await client.responses.create({
      model: 'gpt-4o',
      instructions: instructions.trim(),
      input: transformedText,
      stream: true,
    });

    const responseStream = new ReadableStream({
      async start(controller) {
        console.debug('start stream');
        try {
          for await (const event of stream) {
            let content = '';

            // Handle different event types from Responses API
            // Since we don't have exact types, we'll handle this more safely
            const eventType = event.type;
            const eventData = event as any;

            if (eventType.includes('text.delta')) {
              content = eventData.delta || eventData.text || '';
            } else if (eventType.includes('text.done')) {
              content = '\n'; // Add newline when text is complete
            } else if (eventType.includes('web_search') && eventType.includes('searching')) {
              content = `\n\n🔍 Searching...\n\n`;
            } else if (eventType.includes('web_search') && eventType.includes('completed')) {
              content = `\n\n✅ Search completed\n\n`;
            }

            if (content) {
              const encoded = encoder.encode(content);
              controller.enqueue(encoded);
            }
          }
        } catch (error) {
          console.error('error in stream', error);
          controller.error(error);
        } finally {
          console.debug('end stream, close controller');
          controller.close();
        }
      },
      async cancel() {
        console.debug('cancel stream');
        // The Responses API should handle cancellation automatically
      },
    });

    const host = request.headers.get('host');

    if (host?.includes('localhost')) {
      console.info('localhost uses chunked encoding transfer');
      return new Response(responseStream, {
        headers: {
          'Transfer-Encoding': 'chunked',
          'Content-Type': 'text/plain',
          'X-Content-Type-Options': 'nosniff',
          'X-Category': category || 'unknown',
        },
      });
    }

    console.info('remote uses http 2.0 server push');
    return new Response(responseStream, {
      headers: {
        'Content-Type': 'text/plain',
        'X-Content-Type-Options': 'nosniff',
        'X-Category': category || 'unknown',
      },
    });
  } catch (error) {
    console.error(`error in assistant action: ${error}`);
    if (error instanceof Error && error.name === 'AbortError') {
      console.info('user aborted the request');
      return new Response(null, { status: 204 });
    }
    return json({
      category: 'unknown',
      result: 'Sorry, an error occurred while processing your request.',
    });
  }
};

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string | { category: string; result: string; reasoning?: string };
  isStreaming?: boolean;
}

export default function AssistantRoute() {
  const { user } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  // Refs for cleanup tracking
  const activeAbortController = useRef<AbortController | null>(null);
  const activeStreamReader = useRef<ReadableStreamDefaultReader | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const data = fetcher.data as SerializeFrom<typeof action> | undefined;

    if (fetcher.state === 'idle' && data) {
      if ('result' in data) {
        setMessages((prevMessages) => [
          ...prevMessages,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: {
              category: data.category,
              result: data.result as string,
              reasoning: 'reasoning' in data ? (data.reasoning as string | undefined) : undefined,
            },
          },
        ]);
      } else if ('error' in data) {
        console.error('Error from action:', data.error);
        setMessages((prevMessages) => [
          ...prevMessages,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: { category: 'error', result: `Sorry, an error occurred: ${data.error}` },
          },
        ]);
      }
    }
  }, [fetcher.data, fetcher.state]);

  // Cleanup effect for component unmount
  useEffect(() => {
    return () => {
      // Cancel active fetch request
      if (activeAbortController.current) {
        activeAbortController.current.abort();
        activeAbortController.current = null;
      }

      // Cancel active stream reader
      if (activeStreamReader.current) {
        try {
          activeStreamReader.current.cancel();
        } catch (error) {
          console.log('Stream already closed or cancelled');
        } finally {
          activeStreamReader.current = null;
        }
      }
    };
  }, []);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!inputValue.trim()) return;

      const userMessage: Message = { id: crypto.randomUUID(), role: 'user', content: inputValue };
      setMessages((prevMessages) => [...prevMessages, userMessage]);

      const messageToSend = inputValue;
      setInputValue('');

      try {
        setIsStreaming(true);

        // Create AbortController for this request
        const abortController = new AbortController();
        activeAbortController.current = abortController;

        // Create a new assistant message for streaming
        const assistantMessageId = crypto.randomUUID();
        const assistantMessage: Message = {
          id: assistantMessageId,
          role: 'assistant',
          content: '',
          isStreaming: true,
        };

        setMessages((prevMessages) => [...prevMessages, assistantMessage]);

        const response = await fetch(window.location.pathname + '?_data=routes%2F_app.assistant._index', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ message: messageToSend }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const category = response.headers.get('X-Category');

        // Handle streaming response
        if (response.body) {
          const reader = response.body.getReader();
          activeStreamReader.current = reader;
          const decoder = new TextDecoder();
          let content = '';

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              const chunk = decoder.decode(value, { stream: true });
              const newContent = content + chunk;
              content = newContent;

              // Update the streaming message
              setMessages((prevMessages) =>
                prevMessages.map((msg) => (msg.id === assistantMessageId ? { ...msg, content: newContent } : msg)),
              );
            }

            // Finalize the message
            setMessages((prevMessages) =>
              prevMessages.map((msg) =>
                msg.id === assistantMessageId
                  ? {
                      ...msg,
                      content:
                        category && (category === 'translation' || category === 'glossary')
                          ? { category, result: content, reasoning: undefined }
                          : content,
                      isStreaming: false,
                    }
                  : msg,
              ),
            );

            // Clear reader reference after successful completion
            activeStreamReader.current = null;
          } catch (streamError) {
            // Handle AbortError separately from other stream errors
            if (streamError instanceof Error && streamError.name === 'AbortError') {
              console.log('Stream cancelled by user navigation');
              return; // Don't update UI if request was cancelled
            }

            console.error('Streaming error:', streamError);
            setMessages((prevMessages) =>
              prevMessages.map((msg) =>
                msg.id === assistantMessageId
                  ? {
                      ...msg,
                      content: { category: 'error', result: 'Sorry, an error occurred while streaming the response.' },
                      isStreaming: false,
                    }
                  : msg,
              ),
            );
          } finally {
            // Ensure reader reference is cleared
            activeStreamReader.current = null;
          }
        }
      } catch (error) {
        // Handle AbortError separately from other errors
        if (error instanceof Error && error.name === 'AbortError') {
          console.log('Request cancelled by user navigation');
          return; // Don't update UI if request was cancelled
        }

        console.error('Submit error:', error);
        setMessages((prevMessages) => [
          ...prevMessages,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: { category: 'error', result: 'Sorry, an error occurred while processing your request.' },
          },
        ]);
      } finally {
        setIsStreaming(false);
        // Clear references after request completion
        activeAbortController.current = null;
        activeStreamReader.current = null;
      }
    },
    [inputValue],
  );

  const isSubmitting = isStreaming;

  return (
    <div className="relative flex h-[calc(100vh-5rem)] flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-4 pb-36">
        {messages.map((message) => (
          <div key={message.id} className={cn('flex items-start gap-4', message.role === 'user' ? 'justify-end' : '')}>
            {message.role === 'assistant' && (
              <Avatar className="h-8 w-8">
                <AvatarFallback>
                  <Bot size={18} />
                </AvatarFallback>
              </Avatar>
            )}
            <Card className={cn('max-w-[75%]', message.role === 'user' ? 'bg-primary text-primary-foreground' : '')}>
              <CardContent className={cn('p-3', message.role === 'assistant' ? 'text-foreground' : '')}>
                {typeof message.content === 'string' ? (
                  <div>
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                    </div>
                    {message.isStreaming && (
                      <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span>Generating response...</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content.result}</ReactMarkdown>
                    </div>
                    {(message.content.category === 'glossary' || message.content.category === 'translation') &&
                      message.content.reasoning && (
                        <Accordion collapsible type="single" className="mt-2 w-full">
                          <AccordionItem value="reasoning" className="border-none">
                            <AccordionTrigger className="py-1 text-sm hover:no-underline">
                              Show Reasoning
                            </AccordionTrigger>
                            <AccordionContent className="pb-0 pt-2 text-sm text-muted-foreground">
                              {message.content.reasoning}
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      )}
                  </div>
                )}
              </CardContent>
            </Card>
            {message.role === 'user' && (
              <Avatar className="h-8 w-8">
                {user?.avatar ? <AvatarImage src={user.avatar} alt="User Avatar" /> : null}
                <AvatarFallback>
                  <User size={18} />
                </AvatarFallback>
              </Avatar>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div className="absolute bottom-2 left-4 right-4 rounded-2xl border bg-background p-2">
        <form onSubmit={handleSubmit} className="flex flex-col">
          <Textarea
            rows={2}
            maxLength={150}
            value={inputValue}
            autoComplete="off"
            disabled={isSubmitting}
            placeholder="Type your message..."
            onChange={(e) => setInputValue(e.target.value)}
            className="min-h-[3rem] resize-none border-0 bg-transparent p-2 leading-tight focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!isSubmitting && inputValue.trim()) {
                  const form = e.currentTarget.closest('form');
                  if (form) {
                    form.requestSubmit();
                  }
                }
              }
            }}
          />
          <div className="mt-1 flex items-center justify-end gap-2 px-1">
            <span className="text-xs text-muted-foreground">{inputValue.length} / 150</span>
            <Button
              size="icon"
              type="submit"
              disabled={isSubmitting || !inputValue.trim()}
              className="h-8 w-8 shrink-0 rounded-full bg-primary hover:bg-primary/90"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
