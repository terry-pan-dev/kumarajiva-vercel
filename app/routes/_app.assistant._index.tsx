import type { ActionFunctionArgs, LoaderFunctionArgs, SerializeFrom } from '@remix-run/node';

import { json } from '@remix-run/node';
import { useFetcher, useLoaderData } from '@remix-run/react';
import { Bot, Send, User, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState, useCallback } from 'react';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '~/components/ui/accordion';
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar';
import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';
import { Textarea } from '~/components/ui/textarea';
import { cn } from '~/lib/utils';

import { mastra } from '../../mastra';
import { assertAuthUser } from '../auth.server';

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
  // message should be trimmed if more than 150 characters
  const message = body.message.trim().slice(0, 150);

  const languages = `${user.originLang},${user.targetLang}`;

  const { runId, start } = await mastra.getWorkflow('assistantWorkflow').createRun();
  const threadId = crypto.randomUUID();
  console.log({ runId, languages, message, userId: user.id, threadId });
  const { results } = await start({
    triggerData: {
      languages,
      inputText: message,
      threadId,
      resourceId: user.id,
    },
  });

  if (results?.classifyStep.status === 'success') {
    console.log(`classifyStep: "${results.classifyStep.output.category}"`);
  }
  if (results?.transformStep.status === 'success') {
    console.log(`transformStep: "${results.transformStep.output.result}"`);
  }

  if (results?.nonsupportStep.status === 'success') {
    return json({
      category: 'nonsupport',
      result: results.nonsupportStep.output.result,
    });
  }

  if (results?.unknownStep.status === 'success') {
    return json({
      category: 'unknown',
      result: results.unknownStep.output.result,
    });
  }

  if (results?.clarificationStep.status === 'success') {
    return json({
      category: 'clarification',
      result: results.clarificationStep.output.result,
    });
  }

  if (results?.glossaryStep.status === 'success') {
    return json({
      category: 'glossary',
      result: results.glossaryStep.output.result,
      reasoning: results.glossaryStep.output.reasoning,
    });
  }

  if (results?.translateStep.status === 'success') {
    return json({
      category: 'translation',
      result: results.translateStep.output.result,
      reasoning: results.translateStep.output.reasoning,
    });
  }

  return json({
    category: 'unknown',
    result: 'Unknown error',
  });
};

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string | { category: string; result: string; reasoning?: string };
}

export default function AssistantRoute() {
  const { user } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!inputValue.trim()) return;

      setMessages((prevMessages) => [...prevMessages, { id: crypto.randomUUID(), role: 'user', content: inputValue }]);

      fetcher.submit(
        { message: inputValue },
        {
          method: 'post',
          encType: 'application/json',
        },
      );

      setInputValue('');
    },
    [inputValue, fetcher],
  );

  const isSubmitting = fetcher.state !== 'idle';

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
                  <p>{message.content}</p>
                ) : (
                  <div>
                    <p>{message.content.result}</p>
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
        {isSubmitting && (
          <div className="flex items-start gap-4">
            <Avatar className="h-8 w-8">
              <AvatarFallback>
                <Bot size={18} />
              </AvatarFallback>
            </Avatar>
            <Card>
              <CardContent className="flex items-center gap-2 p-3 text-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Thinking...</span>
              </CardContent>
            </Card>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="absolute bottom-2 left-4 right-4 rounded-2xl border bg-background p-2">
        <fetcher.Form onSubmit={handleSubmit} className="flex flex-col">
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
        </fetcher.Form>
      </div>
    </div>
  );
}
