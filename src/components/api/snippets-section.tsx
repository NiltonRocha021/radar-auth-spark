import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CodeBlock } from "./code-block";
import { SNIPPETS, RESPONSE_JSON } from "@/lib/api-data";

export function SnippetsSection() {
  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold">Quick start</h2>
        <p className="text-xs text-muted-foreground mt-1">Example for <span className="font-mono text-foreground/80">GET /v1/signals</span></p>
      </header>
      <Tabs defaultValue="javascript">
        <TabsList className="bg-secondary/40">
          <TabsTrigger value="javascript">JavaScript</TabsTrigger>
          <TabsTrigger value="python">Python</TabsTrigger>
          <TabsTrigger value="curl">curl</TabsTrigger>
        </TabsList>
        <TabsContent value="javascript" className="mt-3">
          <CodeBlock code={SNIPPETS.javascript} lang="javascript" />
        </TabsContent>
        <TabsContent value="python" className="mt-3">
          <CodeBlock code={SNIPPETS.python} lang="python" />
        </TabsContent>
        <TabsContent value="curl" className="mt-3">
          <CodeBlock code={SNIPPETS.curl} lang="curl" />
        </TabsContent>
      </Tabs>
      <div className="space-y-2">
        <div className="text-xs text-muted-foreground">Response</div>
        <CodeBlock code={RESPONSE_JSON} lang="json" />
      </div>
    </section>
  );
}
