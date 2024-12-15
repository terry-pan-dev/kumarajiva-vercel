import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@vercel/remix';
import { eventStream } from 'remix-utils/sse/server';
import { interval } from 'remix-utils/timers';

import type { OnlineUser } from '../validations/online.validation';

import { onlineSchema } from '../validations/online.validation';

const onlineUsersForRollId: Record<string, OnlineUser[]> = {};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const formData = await request.formData();
  const onlineUser = onlineSchema.parse(Object.fromEntries(formData));
  const usersEditingThisRoll = onlineUsersForRollId[onlineUser.rollId];
  if (usersEditingThisRoll) {
    for (const existingUser of usersEditingThisRoll) {
      // If the user is already in the roll, update their time
      if (existingUser.id === onlineUser.id) {
        const updatedUser = { ...existingUser, time: new Date().toISOString() };
        usersEditingThisRoll.splice(usersEditingThisRoll.indexOf(existingUser), 1, updatedUser);
        break;
      } else {
        usersEditingThisRoll.push(onlineUser);
      }
    }
  } else {
    onlineUsersForRollId[onlineUser.rollId] = [onlineUser];
  }
  return eventStream(request.signal, function setup(send) {
    async function run() {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (let _ of interval(1000, { signal: request.signal })) {
        send({ event: 'login', data: JSON.stringify(onlineUsersForRollId[onlineUser.rollId]) });
      }
    }

    run();

    // Return a cleanup function
    return () => {
      // Cleanup logic if needed, e.g., aborting the signal
      console.log('cleanup');
    };
  });
  // const rollId = new URL(request.url).searchParams.get('rollId');
  // if (!rollId) {
  //   return json({});
  // }
  // if (rollId in onlineUsersForRollId) {
  //   let onlineUsers = onlineUsersForRollId[rollId];
  //   // remove any users that have been inactive for more than 2 minutes
  //   const now = new Date();
  //   const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000);
  //   onlineUsers = onlineUsers.filter((user) => new Date(user.time) > twoMinutesAgo);
  //   return json({ onlineUsers });
  // } else {
  //   onlineUsersForRollId[rollId] = [];
  //   return json({ onlineUsers: [] });
  // }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  return json({ success: true });
};
