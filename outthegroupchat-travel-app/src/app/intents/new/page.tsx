import { Metadata } from 'next';
import { Navigation } from '@/components/Navigation';
import { IntentCreateForm } from '@/components/intents';

export const metadata: Metadata = {
  title: 'Signal an Intent · OutTheGroupchat',
  description: 'Tell your Crew what you’re up for — drinks, brunch, a run, anything.',
};

export default function NewIntentPage() {
  return (
    <>
      <Navigation />
      <main className="mx-auto max-w-2xl px-4 pt-24 pb-16 sm:px-6 lg:px-8">
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-otg-text-bright">
            What are you up for?
          </h1>
          <p className="mt-2 text-otg-text-muted">
            Free-form — type &ldquo;drinks tonight&rdquo; or &ldquo;brunch Saturday.&rdquo; We&rsquo;ll
            pick a Topic and your Crew will see it. No commitment until you mark it as Committed.
          </p>
        </header>
        <IntentCreateForm />
      </main>
    </>
  );
}
