import { Outlet } from '@remix-run/react';
import { motion, stagger, useAnimate } from 'framer-motion';
import { useEffect } from 'react';
import { ClientOnly } from 'remix-utils/client-only';

export default function Auth() {
  const paragraph = '若人欲了知，三世一切佛，应观法界性，一切唯心造';
  return (
    <div className="h-screen">
      <header
        className="h-full bg-cover"
        style={{
          backgroundImage: 'url(https://ik.imagekit.io/q5edmtudmz/peter-lloyd-680526-unsplash_TYZn4kayG.jpg)',
        }}
      >
        <div className="content px-8 py-2">
          <nav className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-200">Kumarajiva</h2>
          </nav>
          <div className="body mx-2 mt-2 lg:mx-8 lg:mt-20">
            <div className="items-center justify-between md:flex">
              <div className="mr-auto w-full md:w-1/2" style={{ textShadow: '0 20px 50px hsla(0,0%,0%,8)' }}>
                <div className="flex flex-row justify-center gap-4">
                  <ClientOnly fallback={<div>Loading...</div>}>
                    {() => <TextGenerateEffect paragraph={paragraph} />}
                  </ClientOnly>
                </div>
              </div>
              <div className="mt-6 w-full md:max-w-md">
                <Outlet />
              </div>
            </div>
          </div>
        </div>
      </header>
    </div>
  );
}

export const TextGenerateEffect = ({
  paragraph,
  className,
  filter = true,
  duration = 1.5,
}: {
  paragraph: string;
  className?: string;
  filter?: boolean;
  duration?: number;
}) => {
  const [scope, animate] = useAnimate();
  useEffect(() => {
    animate(
      'span',
      {
        opacity: 1,
        filter: filter ? 'blur(0px)' : 'none',
      },
      {
        duration: duration ? duration : 1,
        delay: stagger(0.3),
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.current]);

  const renderWords = () => {
    return (
      <motion.div ref={scope}>
        {paragraph.split('，').map((sentence, idx) => {
          return (
            <div key={idx} className="flex flex-row">
              {sentence.split('').map((word, idx) => {
                return (
                  <motion.span
                    key={word + idx}
                    className="px-2 py-4 text-white opacity-0 dark:text-black"
                    style={{
                      filter: filter ? 'blur(15px)' : 'none',
                    }}
                  >
                    {word}{' '}
                  </motion.span>
                );
              })}
            </div>
          );
        })}
      </motion.div>
    );
  };

  return (
    <div className="font-huninn text-3xl font-bold leading-snug tracking-wide text-black [writing-mode:vertical-rl] dark:text-white lg:text-5xl">
      {renderWords()}
    </div>
  );
};
