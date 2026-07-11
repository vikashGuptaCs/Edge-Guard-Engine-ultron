import React from "react";
import { getListFixturesQueryKey, useListFixtures } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, Calendar, Swords } from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";

export default function MatchesPage() {
  const [search, setSearch] = React.useState("");
  const fixtureParams = {};
  
  const { data: fixtures = [], isLoading } = useListFixtures(fixtureParams, {
    query: {
      refetchInterval: 10000,
      queryKey: getListFixturesQueryKey(fixtureParams),
    },
  });

  const filteredFixtures = fixtures.filter(f => 
    f.homeTeam.toLowerCase().includes(search.toLowerCase()) || 
    f.awayTeam.toLowerCase().includes(search.toLowerCase()) ||
    f.competition.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold font-mono tracking-tight flex items-center gap-2">
            <Swords className="w-6 h-6 text-primary" />
            FIXTURES_DB
          </h1>
          <p className="text-sm font-mono text-muted-foreground">All tracked matches across supported leagues.</p>
        </div>
        
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search teams, leagues..."
            className="pl-9 font-mono text-sm bg-card"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="border rounded-md bg-card/30 overflow-hidden flex-1">
        <Table>
          <TableHeader className="bg-muted/50 font-mono text-xs uppercase tracking-wider">
            <TableRow>
              <TableHead>Status</TableHead>
              <TableHead>Competition</TableHead>
              <TableHead>Match</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Kickoff</TableHead>
              <TableHead className="text-right">Edge Score</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="font-mono text-sm">
            {isLoading && fixtures.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">Loading database...</TableCell>
              </TableRow>
            ) : filteredFixtures.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">No fixtures match search criteria.</TableCell>
              </TableRow>
            ) : (
              filteredFixtures.map((fixture) => (
                <TableRow key={fixture.fixtureId} className="hover:bg-muted/30 group">
                  <TableCell>
                    <Badge variant={fixture.status === 'live' ? 'default' : 'outline'} className={
                      fixture.status === 'live' ? 'bg-green-500 hover:bg-green-600 text-white' : ''
                    }>
                      {fixture.status}
                      {fixture.status === 'live' && fixture.minutePlayed && (
                        <span className="ml-1 opacity-80">{fixture.minutePlayed}'</span>
                      )}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{fixture.competition}</TableCell>
                  <TableCell>
                    <Link href={`/dashboard/matches/${fixture.fixtureId}`}>
                      <span className="font-bold cursor-pointer group-hover:text-primary transition-colors">
                        {fixture.homeTeam} vs {fixture.awayTeam}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="font-bold">
                    {fixture.homeScore !== null ? `${fixture.homeScore} - ${fixture.awayScore}` : '-'}
                  </TableCell>
                  <TableCell className="text-muted-foreground flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    {format(new Date(fixture.kickoffTs), "MMM dd, HH:mm")}
                  </TableCell>
                  <TableCell className="text-right font-bold text-primary">
                    {fixture.currentEdgeScore ? fixture.currentEdgeScore.toFixed(1) : '-'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
