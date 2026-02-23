import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { motion } from "framer-motion";

export default function NotFound() {
  return (
    <Layout>
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-md"
        >
          <p className="text-8xl font-display font-bold text-primary/20 mb-4">404</p>
          <h1 className="font-display font-bold text-3xl mb-4">Page Not Found</h1>
          <p className="text-muted-foreground text-lg mb-8">
            The page you're looking for doesn't exist. Use our PCB feature to find what you need instead.
          </p>
          <Link href="/">
            <Button size="lg" className="font-semibold">Back to Home</Button>
          </Link>
        </motion.div>
      </div>
    </Layout>
  );
}
