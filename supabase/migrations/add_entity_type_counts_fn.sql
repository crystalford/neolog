-- Function to get entity counts grouped by type for a user
CREATE OR REPLACE FUNCTION get_entity_type_counts(p_user_id uuid)
RETURNS TABLE(type text, count bigint) AS $$
BEGIN
  RETURN QUERY
    SELECT e.type, COUNT(*)::bigint
    FROM entities e
    WHERE e.user_id = p_user_id
    GROUP BY e.type
    ORDER BY COUNT(*) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
