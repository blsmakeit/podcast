import { useState } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Bell, CheckCircle, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { useSubscribe } from "@/hooks/use-episodes";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";

const benefitKeys = ['subscribe.benefit1', 'subscribe.benefit2', 'subscribe.benefit3', 'subscribe.benefit4'];

export default function Subscribe() {
  const [email, setEmail] = useState("");
  const { mutate: subscribe, isPending, isSuccess } = useSubscribe();
  const { toast } = useToast();
  const { t } = useLanguage();

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    subscribe(email, {
      onSuccess: () => {
        setEmail("");
        toast({ title: t('subscribe.success.title'), description: t('subscribe.success.desc') });
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to subscribe. Please try again.", variant: "destructive" });
      },
    });
  };

  return (
    <Layout>
      <section className="relative pt-20 pb-32 overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-background to-background" />

        <div className="container mx-auto px-4 max-w-2xl text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-semibold mb-6">
              <Bell className="w-4 h-4" />
              {t('subscribe.badge')}
            </span>
            <h1 className="font-display font-bold text-5xl md:text-6xl mb-6 tracking-tight leading-[1.1]">
              {t('subscribe.title1')} <span className="text-gradient">{t('subscribe.title2')}</span>
            </h1>
            <p className="text-xl text-muted-foreground mb-10 leading-relaxed">
              {t('subscribe.subtitle')}
            </p>

            {isSuccess ? (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
                <Card className="p-8 border-primary/20 bg-primary/5 text-center">
                  <CheckCircle className="w-12 h-12 text-primary mx-auto mb-4" />
                  <h2 className="font-display font-bold text-2xl mb-2">{t('subscribe.success.title')}</h2>
                  <p className="text-muted-foreground">{t('subscribe.success.desc')}</p>
                </Card>
              </motion.div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
                <Input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isPending}
                  className="h-12 text-base"
                />
                <Button type="submit" size="lg" disabled={isPending} className="font-semibold shadow-lg shadow-primary/20 shrink-0">
                  {isPending
                    ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />{t('subscribe.button_loading')}</>
                    : t('subscribe.button')}
                </Button>
              </form>
            )}

            <p className="text-xs text-muted-foreground mt-4">{t('subscribe.no_spam')}</p>
          </motion.div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4 max-w-xl">
          <h2 className="font-display font-bold text-2xl mb-8 text-center">{t('subscribe.benefits.title')}</h2>
          <ul className="space-y-4">
            {benefitKeys.map((key, i) => (
              <motion.li
                key={key}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="flex items-start gap-3"
              >
                <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <span className="text-muted-foreground">{t(key)}</span>
              </motion.li>
            ))}
          </ul>
        </div>
      </section>
    </Layout>
  );
}
