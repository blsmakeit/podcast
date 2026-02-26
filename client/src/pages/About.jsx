import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "wouter";
import { Cpu, Mic2, Zap, Users } from "lucide-react";
import { motion } from "framer-motion";
import { useLanguage } from "@/hooks/use-language";

const pillarIcons = [Cpu, Mic2, Zap, Users];
const pillarKeys = ['pillar1', 'pillar2', 'pillar3', 'pillar4'];

export default function About() {
  const { t } = useLanguage();

  const pillars = pillarKeys.map((key, i) => ({
    icon: pillarIcons[i],
    title: t(`about.${key}.title`),
    description: t(`about.${key}.desc`),
  }));

  return (
    <Layout>
      {/* Hero */}
      <section className="relative pt-20 pb-16 overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-background to-background" />
        <div className="container mx-auto px-4 max-w-3xl text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-semibold mb-6">
              <Cpu className="w-4 h-4" />
              {t('about.badge')}
            </span>
            <h1 className="font-display font-bold text-5xl md:text-6xl mb-6 tracking-tight leading-[1.1]">
              {t('about.hero.title1')}<br />
              <span className="text-gradient">{t('about.hero.title2')}</span>
            </h1>
            <p className="text-xl text-muted-foreground mb-10 leading-relaxed">
              {t('about.hero.subtitle')}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/episodes">
                <Button size="lg" className="font-semibold shadow-lg shadow-primary/20 w-full sm:w-auto">
                  {t('about.browse')}
                </Button>
              </Link>
              <Link href="/subscribe">
                <Button size="lg" variant="outline" className="w-full sm:w-auto">
                  {t('about.subscribe')}
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Pillars */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-14">
            <h2 className="font-display font-bold text-3xl md:text-4xl mb-3">{t('about.pillars.title')}</h2>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">{t('about.pillars.subtitle')}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {pillars.map((pillar, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
              >
                <Card className="p-6 h-full hover:shadow-lg transition-shadow">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                    <pillar.icon className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="font-display font-bold text-lg mb-2">{pillar.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{pillar.description}</p>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="container mx-auto px-4 text-center max-w-2xl">
          <h2 className="font-display font-bold text-3xl md:text-4xl mb-4">{t('about.cta.title')}</h2>
          <p className="text-muted-foreground text-lg mb-8">{t('about.cta.subtitle')}</p>
          <Link href="/subscribe">
            <Button size="lg" className="font-semibold shadow-lg shadow-primary/20">
              {t('about.cta.button')}
            </Button>
          </Link>
        </div>
      </section>
    </Layout>
  );
}
