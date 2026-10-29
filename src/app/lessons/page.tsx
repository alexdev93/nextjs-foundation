export default function LessonPage() {
  return (
    <>
      {/* <PageHeader title={SITE.name} description={SITE.description} /> */}
      <section className="grid gap-4 sm:grid-cols-2">
        {/* {EXAMPLES.map((example) => (
          <Card key={example.href}>
            <CardHeader>
              <Badge variant="secondary">{example.kind}</Badge>
              <CardTitle>{example.title}</CardTitle>
              <CardDescription>{example.description}</CardDescription>
            </CardHeader>
            <CardFooter className="mt-auto">
              <Button asChild variant="outline" size="sm">
                <Link href={example.href}>
                  Open <ArrowRight />
                </Link>
              </Button>
            </CardFooter>
          </Card>
        ))} */}
      </section>
    </>
  );
}
