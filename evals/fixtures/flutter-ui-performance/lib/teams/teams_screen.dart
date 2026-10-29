import 'package:flutter/material.dart';

import 'teams_state.dart';
import 'teams_view_model.dart';

class TeamsScreen extends StatefulWidget {
  const TeamsScreen({super.key, required this.viewModel});

  final TeamsViewModel viewModel;

  @override
  State<TeamsScreen> createState() => _TeamsScreenState();
}

class _TeamsScreenState extends State<TeamsScreen> {
  int _expandedCount = 0;
  String _query = '';

  List<Team> _visibleTeams(TeamsState state) {
    final sorted = [...state.teams]..sort((a, b) => a.name.compareTo(b.name));
    return sorted
        .where((team) => team.name.toLowerCase().contains(_query))
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Teams')),
      body: ValueListenableBuilder<TeamsState>(
        valueListenable: widget.viewModel,
        builder: (context, state, _) {
          return Column(
            children: [
              TextField(
                onChanged: (value) => setState(() => _query = value),
              ),
              Text('$_expandedCount expanded'),
              Expanded(
                child: ListView.builder(
                  itemCount: _visibleTeams(state).length,
                  itemBuilder: (context, index) {
                    final team = _visibleTeams(state)[index];
                    final members = state.members[team.id] ?? const <String>[];
                    return TeamCard(
                      team: team,
                      members: members,
                      onToggle: (expanded) => setState(() {
                        _expandedCount += expanded ? 1 : -1;
                      }),
                    );
                  },
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class TeamCard extends StatefulWidget {
  const TeamCard({
    super.key,
    required this.team,
    required this.members,
    required this.onToggle,
  });

  final Team team;
  final List<String> members;
  final ValueChanged<bool> onToggle;

  @override
  State<TeamCard> createState() => _TeamCardState();
}

class _TeamCardState extends State<TeamCard>
    with SingleTickerProviderStateMixin {
  bool _expanded = false;
  late final AnimationController _arrow = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 200),
  );

  @override
  void dispose() {
    _arrow.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Column(
        children: [
          ListTile(
            title: Text(widget.team.name),
            trailing: RotationTransition(
              turns: _arrow,
              child: const Icon(Icons.expand_more),
            ),
            onTap: () {
              setState(() => _expanded = !_expanded);
              _expanded ? _arrow.forward() : _arrow.reverse();
              widget.onToggle(_expanded);
            },
          ),
          if (_expanded && widget.members.isNotEmpty)
            for (final name in widget.members) Text(name),
          if (_expanded && widget.members.isEmpty)
            const Text('No members'),
        ],
      ),
    );
  }
}
