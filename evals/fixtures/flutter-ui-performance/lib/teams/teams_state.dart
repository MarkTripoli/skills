class Team {
  const Team({required this.id, required this.name});

  final String id;
  final String name;
}

class TeamsState {
  const TeamsState({
    this.teams = const [],
    this.members = const {},
    this.loading = false,
  });

  final List<Team> teams;

  /// Member names per team id. A team id with no entry has not loaded yet.
  final Map<String, List<String>> members;
  final bool loading;

  TeamsState copyWith({
    List<Team>? teams,
    Map<String, List<String>>? members,
    bool? loading,
  }) {
    return TeamsState(
      teams: teams ?? this.teams,
      members: members ?? this.members,
      loading: loading ?? this.loading,
    );
  }
}
