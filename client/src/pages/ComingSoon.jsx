import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import { Construction } from "lucide-react";
import { motion } from "framer-motion";

const labels = {
  "/series": { title: "Series", description: "Curated series of episodes around specific themes — coming soon." },
  "/hosts": { title: "Hosts", description: "Meet the people behind the microphone — coming soon." },
  "/careers": { title: "Careers", description: "Interested in joining the MAKEIT.TECH team? We'll be posting opportunities here." },
  "/contact": { title: "Contact Us", description: "We'd love to hear from you. A contact form is on its way." },
  "/privacy": { title: "Privacy Policy", description: "Our privacy policy will be available here shortly." },
  "/terms": { title: "Terms of Service", description: "Our terms of service will be available here shortly." },
};

export default function ComingSoon() {
  const [location] = useLocation();
  const meta = labels[location] ?? { title: "Coming Soon", description: "This page is currently under construction." };

  return (
    <Layout>
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-md"
        >
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Construction className="w-8 h-8 text-primary" />
          </div>
          <h1 className="font-display font-bold text-4xl mb-4">{meta.title}</h1>
          <p className="text-muted-foreground text-lg mb-8 leading-relaxed">{meta.description}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/">
              <Button className="w-full sm:w-auto">Back to Home</Button>
            </Link>
            <Link href="/subscribe">
              <Button variant="outline" className="w-full sm:w-auto">Get Notified</Button>
            </Link>
          </div>
        </motion.div>
      </div>
    </Layout>
  );
}
