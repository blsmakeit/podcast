import { useState } from "react";
import { Layout } from "@/components/Layout";
import { useContact } from "@/hooks/use-episodes";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

export default function Contact() {
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [sent, setSent] = useState(false);
  const { mutate: sendContact, isPending } = useContact();
  const { toast } = useToast();

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    sendContact(form, {
      onSuccess: () => {
        setSent(true);
        setForm({ name: "", email: "", subject: "", message: "" });
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to send message. Please try again.", variant: "destructive" });
      },
    });
  };

  const canSubmit = form.name.trim() && form.email.trim() && form.message.trim();

  return (
    <Layout>
      <section className="relative pt-20 pb-32 overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-background to-background" />

        <div className="container mx-auto px-4 max-w-2xl">
          {/* Header */}
          <div className="mb-10 text-center">
            <h1 className="font-display font-black text-5xl md:text-6xl mb-4 tracking-tight leading-[1.1]">
              Get in <span className="text-gradient">Touch</span>
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              Want to be a guest on MAKEIT OR BREAKIT? Have a question or partnership idea? Drop us a message.
            </p>
          </div>

          {sent ? (
            <div className="text-center py-16 space-y-4">
              <div className="text-5xl">✅</div>
              <h2 className="font-display font-bold text-2xl">Message sent!</h2>
              <p className="text-muted-foreground">
                We'll get back to you as soon as possible.
              </p>
              <button
                onClick={() => setSent(false)}
                className="mt-4 text-primary underline text-sm"
              >
                Send another message
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium mb-1">Name <span className="text-destructive">*</span></label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={update("name")}
                    placeholder="Your name"
                    disabled={isPending}
                    className="w-full border border-input rounded-lg px-4 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Email <span className="text-destructive">*</span></label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={update("email")}
                    placeholder="your@email.com"
                    disabled={isPending}
                    className="w-full border border-input rounded-lg px-4 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Subject</label>
                <input
                  type="text"
                  value={form.subject}
                  onChange={update("subject")}
                  placeholder="e.g. Guest application, Partnership, General question"
                  disabled={isPending}
                  className="w-full border border-input rounded-lg px-4 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Message <span className="text-destructive">*</span></label>
                <textarea
                  value={form.message}
                  onChange={update("message")}
                  placeholder="Tell us about yourself or your question..."
                  rows={6}
                  disabled={isPending}
                  className="w-full border border-input rounded-lg px-4 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary resize-y disabled:opacity-50"
                />
              </div>

              <button
                type="submit"
                disabled={isPending || !canSubmit}
                className="w-full bg-primary text-primary-foreground py-3 rounded-lg font-semibold text-sm hover:bg-primary/90 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : "Send Message →"}
              </button>

              <p className="text-center text-xs text-muted-foreground">
                Or email us directly at{" "}
                <a href="mailto:contact@make-it.tech" className="text-primary hover:underline">
                  contact@make-it.tech
                </a>
              </p>
            </form>
          )}
        </div>
      </section>
    </Layout>
  );
}
